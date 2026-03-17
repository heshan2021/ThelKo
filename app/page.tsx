"use client";

import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import "leaflet/dist/leaflet.css";

// Load map components dynamically to avoid SSR errors with Leaflet
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const Tooltip = dynamic(() => import("react-leaflet").then(m => m.Tooltip), { ssr: false });
const ZoomControl = dynamic(() => import("react-leaflet").then(m => m.ZoomControl), { ssr: false });
const MapUpdater = dynamic(() => import("./components/MapUpdater"), { ssr: false });

type FuelStatus = "Available" | "Empty" | "Unknown" | "Likely Available" | "Confirmed Available" | "Not Sure";

interface Station {
  id: string;
  name: string;
  address: string;
  location: string;
  lat: number;
  lng: number;
  google_place_id?: string;
  official_hours?: string;
  status_92: FuelStatus;
  status_95: FuelStatus;
  status_auto_diesel: FuelStatus;
  status_super_diesel: FuelStatus;
  status_kerosene: FuelStatus;
  last_updated: string;
}

const SRI_LANKA_CENTER = { lat: 7.8731, lng: 80.7718 };

import { Search, Navigation, ChevronUp, ChevronDown, MapPinPlus, Loader2 } from "lucide-react";

// Haversine distance formula to calculate distance between two coordinates in kilometers
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Operating Hours parsing logic
function getStationOperatingStatus(hoursString?: string): { isOpen: boolean | null; text: string } {
  if (!hoursString || hoursString === "Unknown") return { isOpen: null, text: "Hours Unknown" };
  if (hoursString.toLowerCase() === "24 hours") return { isOpen: true, text: "OPEN NOW (24 Hours)" };

  // Matches "06:00 AM - 10:00 PM"
  const match = hoursString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return { isOpen: null, text: "Hours Unknown" };

  let [ , startH, startM, startP, endH, endM, endP ] = match;
  
  const parseTime = (h: string, m: string, p: string) => {
    let hour = parseInt(h, 10);
    if (p.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (p.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return hour * 60 + parseInt(m, 10);
  };

  const startTimeMs = parseTime(startH, startM, startP);
  const endTimeMs = parseTime(endH, endM, endP);

  // Get current time in Sri Lanka (+05:30)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const slTime = new Date(utc + (3600000 * 5.5));
  const currentTimeMs = slTime.getHours() * 60 + slTime.getMinutes();

  let isOpen = false;
  if (endTimeMs < startTimeMs) {
    // Operates past midnight (e.g. 10 PM to 6 AM)
    isOpen = currentTimeMs >= startTimeMs || currentTimeMs <= endTimeMs;
  } else {
    isOpen = currentTimeMs >= startTimeMs && currentTimeMs <= endTimeMs;
  }

  if (isOpen) {
    return { isOpen: true, text: `OPEN NOW (Until ${endH} ${endP.toUpperCase()})` };
  } else {
    return { isOpen: false, text: `CLOSED (Opens at ${startH} ${startP.toUpperCase()})` };
  }
}

export default function Home() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [leafletIcon, setLeafletIcon] = useState<any>(null);
  
  // New UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [selectedFuel, setSelectedFuel] = useState<{stationId: string, stationName: string, fuelKey: string, fuelLabel: string} | null>(null);
  const [isMobilePanelExpanded, setIsMobilePanelExpanded] = useState(false);
  const [isMissingDrawerOpen, setIsMissingDrawerOpen] = useState(false);
  const [missingStationData, setMissingStationData] = useState({ name: "", mapsLink: "" });
  const [isSubmittingMissing, setIsSubmittingMissing] = useState(false);

  // Initialize leaflet icon setup on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const L = require("leaflet");
      
      // Modern sleek markers instead of standard Leaflet default
      setLeafletIcon(() => (color: string) => new L.Icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      }));
      
      // Separate pulsing dot icon for User Location
      setLeafletIcon((prev: any) => {
        const icons: any = { default: prev };
        icons.userLocation = new L.DivIcon({
          className: 'bg-transparent',
          html: `<div class="relative w-4 h-4"><div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-75"></div><div class="relative w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        return icons;
      });
    }
  }, []);

  // Initialize Device ID & Location
  useEffect(() => {
    let id = localStorage.getItem("device_id");
    if (!id) {
      id = uuidv4();
      localStorage.setItem("device_id", id);
    }
    setDeviceId(id);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.error("Geolocation error:", err)
      );
    }
  }, []);

  // Fetch initial stations data
  const fetchStations = async () => {
    const { data, error } = await supabase
      .from("stations")
      .select("*, location");
      
    if (data) {
      const parsedData = data.map(st => {
         return { ...st, lat: st.lat || 7.8731, lng: st.lng || 80.7718 };
      });
      setStations(parsedData);
    }
  };

  useEffect(() => {
    fetchStations();

    // Supabase Realtime Subscription
    const subscription = supabase
      .channel("public:stations")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stations" },
        (payload) => {
          setStations((current) =>
            current.map((station) =>
              station.id === payload.new.id ? { ...station, ...payload.new } : station
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Time Decay Logic
  const getDisplayStatus = (status: FuelStatus, lastUpdated: string | null | undefined): FuelStatus => {
    // Note: The UI now trusts the database for granular "Likely Available" or "Not Sure" states
    // but we still want to gracefully downgrade truly old "Confirmed Available" or "Empty" tags 
    // to "Unknown" if no one has touched them in a very long time (> 12 hours).
    
    if (!lastUpdated) return status; 
    
    // Validate if the parsed date is actual invalid format
    const time = new Date(lastUpdated).getTime();
    if (isNaN(time)) return status;

    const decayTime = 12 * 60 * 60 * 1000; // 12 hours in ms
    if (Date.now() - time > decayTime) {
      return "Unknown";
    }
    return status;
  };

  // Handle Report Submission
  const submitReport = async (stationId: string, fuelType: string, reportedStatus: "Available" | "Empty") => {
    if (!deviceId) return alert("Device ID not found");
    
    // Check LocalStorage Cooldown
    const cooldownKey = `cooldown_${stationId}_${fuelType}`;
    const lastVote = localStorage.getItem(cooldownKey);
    
    if (lastVote) {
        const timeSince = Date.now() - parseInt(lastVote);
        if (timeSince < 30 * 60 * 1000) { // 30 minutes
            alert("You've already reported this fuel type recently. Please wait before reporting again to prevent spam.");
            return;
        }
    }
    
    // Create a unique key for the button loader state
    const actionKey = `${stationId}-${fuelType}-${reportedStatus}`;
    setSubmittingKey(actionKey);

    // We allow remote reports but flag them `is_remote` for anti-spam in the backend
    if (!userLocation) console.warn("Location absent; report marked remote.");

    const p_lon = userLocation ? userLocation.lng : SRI_LANKA_CENTER.lng;
    const p_lat = userLocation ? userLocation.lat : SRI_LANKA_CENTER.lat;

    const { data, error } = await supabase.rpc("submit_fuel_report", {
      p_station_id: stationId,
      p_device_id: deviceId,
      p_fuel_type: fuelType,
      p_reported_status: reportedStatus,
      p_user_lon: p_lon,
      p_user_lat: p_lat
    });

    setSubmittingKey(null);

    if (error) {
      console.error(error);
      alert("Failed to submit report. Please try again.");
    } else {
      // Record successful vote in local storage to prevent immediate spam
      localStorage.setItem(cooldownKey, Date.now().toString());
      alert(`Report submitted successfully! \n\nNote: The station status may take a moment to update or require confirmation from other drivers.`);
    }
  };

  const handleMissingSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missingStationData.name || !missingStationData.mapsLink || !deviceId) return;
    
    setIsSubmittingMissing(true);
    
    const { error } = await supabase.from('pending_stations').insert({
      name: missingStationData.name,
      maps_link: missingStationData.mapsLink,
      device_id: deviceId
    });

    setIsSubmittingMissing(false);
    
    if (error) {
      console.error(error);
      alert("Something went wrong holding onto this data. Please try again.");
    } else {
      alert("Thank you! Your submission has been sent for review by the ThelKo team.");
      setIsMissingDrawerOpen(false);
      setMissingStationData({ name: "", mapsLink: "" }); // Reset
    }
  };

  // Derived State
  const filteredStations = stations.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Map sort and limit for closest stations (fallback to generic map center if userLocation denied avoiding crash)
  const referenceLocation = userLocation || SRI_LANKA_CENTER;
  
  const nearestStations = [...filteredStations]
    .map(station => ({
      ...station,
      distanceKm: getDistanceFromLatLonInKm(referenceLocation.lat, referenceLocation.lng, station.lat, station.lng)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  // Minimalist Status Badge Helper
  const StatusBadge = ({ status }: { status: FuelStatus }) => {
    if (status === 'Available') return <span className="bg-emerald-500/10 text-emerald-600 px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider uppercase border border-emerald-500/20">Available</span>;
    if (status === 'Empty') return <span className="bg-rose-500/10 text-rose-600 px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider uppercase border border-rose-500/20">Empty</span>;
    return <span className="bg-slate-500/10 text-slate-500 px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider uppercase border border-slate-500/20">Unknown</span>;
  };

  return (
    <main className="h-screen w-full flex flex-col font-sans overflow-hidden bg-slate-50 text-slate-900">
      
      {/* Modern Floating Header over Map */}
      <div className="absolute top-4 left-4 right-4 md:top-6 md:right-6 md:left-auto md:max-w-xs z-[2000] pointer-events-none">
         <div className="bg-white/90 backdrop-blur-xl px-5 py-4 md:px-6 md:py-4 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/50 pointer-events-auto flex flex-col gap-2">
            <h1 className="text-xl md:text-xl font-extrabold tracking-tight bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent leading-none">
              Welcome to Thel Ko! ⛽
            </h1>
            <p className="text-[12px] md:text-xs font-medium text-slate-600 leading-relaxed">
              This community map helps everyone find fuel without wasting their quota.
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mt-1">
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                <span className="text-slate-900 font-extrabold">How to help:</span> Waiting in line or just pumped? Tap your station below to <span className="text-emerald-600">Mark Available</span> or <span className="text-rose-600">Mark Empty</span>.
              </p>
            </div>
         </div>
      </div>

      <div className="flex-1 relative z-0">
        
        {/* Floating UI Panel (Modern Minimalist) */}
        <div className="absolute top-auto bottom-0 left-0 right-0 md:top-6 md:left-6 md:bottom-auto md:w-[380px] max-h-[60vh] md:max-h-[calc(100vh-3rem)] flex flex-col gap-0 rounded-t-[32px] md:rounded-[32px] bg-white/80 backdrop-blur-2xl shadow-[0_-8px_40px_rgb(0,0,0,0.08)] md:shadow-[0_8px_40px_rgb(0,0,0,0.08)] border border-white overflow-hidden transition-all duration-500 ease-out z-[1000]">
          
          <div className="p-6 pb-4 relative z-10 shrink-0">
            {/* Mobile Drag Handle - Tappable Area */}
            <div 
              className="md:hidden py-3 -mt-3 mb-3 cursor-pointer flex justify-center"
              onClick={() => setIsMobilePanelExpanded(!isMobilePanelExpanded)}
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>
            
            <h2 
              className="text-2xl font-bold tracking-tight text-slate-900 mb-4 md:hidden flex justify-between items-center cursor-pointer"
              onClick={() => setIsMobilePanelExpanded(!isMobilePanelExpanded)}
            >
              Thel Thiyenawada
              <div className="bg-slate-100 p-2 rounded-full cursor-pointer hover:bg-slate-200 transition-colors">
                 {isMobilePanelExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronUp className="h-4 w-4 text-slate-500" />}
              </div>
            </h2>

            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-transform group-focus-within:scale-110">
                <Search className="h-4 w-4 text-primary shrink-0 transition-colors" />
              </div>
              <input
                type="text"
                className="block w-full pl-12 pr-4 py-4 rounded-2xl leading-5 bg-slate-100/50 hover:bg-slate-100 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-[3px] focus:ring-slate-900/10 transition-all font-medium text-[15px] border border-transparent focus:border-slate-200"
                placeholder="Search by station or city..."
                value={searchQuery}
                onFocus={() => setIsMobilePanelExpanded(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) setIsMobilePanelExpanded(true);
                }}
              />
            </div>
          </div>

          <div className={`overflow-y-auto px-6 pb-8 space-y-4 pt-0 transition-all duration-300 ${!isMobilePanelExpanded ? 'max-md:hidden' : ''}`}>
            <div className="flex items-center gap-2 mb-4 sticky top-0 bg-white/80 backdrop-blur-md py-2 z-20 -mx-2 px-2 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Navigation className="h-3 w-3 text-slate-600" />
              </div>
              <h3 className="text-[13px] font-bold text-slate-900 tracking-wide uppercase">
                {searchQuery ? "Search Results" : "Nearest Stations"}
              </h3>
            </div>
            
            <div className="space-y-4 pb-4">
              {nearestStations.map((station) => {
                const fuels = [
                  { key: "92", label: "92 Octane", status: getDisplayStatus(station.status_92, station.last_updated) },
                  { key: "95", label: "95 Octane", status: getDisplayStatus(station.status_95, station.last_updated) },
                  { key: "auto_diesel", label: "Auto Diesel", status: getDisplayStatus(station.status_auto_diesel, station.last_updated) },
                  { key: "super_diesel", label: "Super Diesel", status: getDisplayStatus(station.status_super_diesel, station.last_updated) },
                  { key: "kerosene", label: "Kerosene", status: getDisplayStatus(station.status_kerosene, station.last_updated) },
                ];
                
                const opStatus = getStationOperatingStatus(station.official_hours);
                                
                return (
                  <div key={station.id} className="bg-white rounded-[24px] p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 hover:border-slate-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <h4 className="font-extrabold text-[16px] text-slate-900 tracking-tight leading-tight pr-4">{station.name}</h4>
                        <div className="mt-1 flex items-center gap-1.5">
                          {opStatus.isOpen === true && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> {opStatus.text}
                            </span>
                          )}
                          {opStatus.isOpen === false && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> {opStatus.text}
                            </span>
                          )}
                          {opStatus.isOpen === null && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> {opStatus.text}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                        {station.distanceKm.toFixed(1)} km
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-500 font-medium mb-3 truncate leading-relaxed mt-1.5">{station.address}</p>
                    
                    <div className="mb-4">
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}${station.google_place_id ? `&query_place_id=${station.google_place_id}` : ''}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-200 hover:border-blue-600 py-2 rounded-xl text-[12px] font-bold transition-colors duration-300"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Get Directions
                        </a>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {fuels.map((fuel) => {
                        let bgColor = 'bg-slate-50/50 border border-slate-100/50';
                        let textColor = 'text-slate-500';
                        
                        // Map the complex granular statuses to colors
                        if (fuel.status === 'Available' || fuel.status === 'Confirmed Available') {
                            bgColor = 'bg-emerald-50/80 border border-emerald-100/50';
                            textColor = 'text-emerald-950';
                        } else if (fuel.status === 'Likely Available') {
                            bgColor = 'bg-emerald-50/40 border border-emerald-100/30';
                            textColor = 'text-emerald-800';
                        } else if (fuel.status === 'Not Sure') {
                            bgColor = 'bg-orange-50/80 border border-orange-100/50';
                            textColor = 'text-orange-950';
                        } else if (fuel.status === 'Empty') {
                            bgColor = 'bg-rose-50/80 border border-rose-100/50';
                            textColor = 'text-rose-950';
                        }

                        // Should the buttons default to visible? Only if the state needs immediate clearing up
                        const isUnknownOrDisputed = fuel.status === 'Unknown' || fuel.status === 'Not Sure';

                        return (
                        <div 
                          key={fuel.key} 
                          className={`group p-2.5 rounded-xl transition-colors cursor-pointer md:cursor-default ${bgColor}`}
                          onClick={() => {
                            if (window.innerWidth < 768) {
                              setSelectedFuel({ stationId: station.id, stationName: station.name, fuelKey: fuel.key, fuelLabel: fuel.label });
                            }
                          }}
                        >
                          <div className="flex flex-col gap-1.5 mb-2 pointer-events-none md:pointer-events-auto">
                             <span className={`text-[11px] font-bold uppercase tracking-wider ${textColor}`}>{fuel.label}</span> 
                             <div className="flex items-center">
                               {(fuel.status === 'Available' || fuel.status === 'Confirmed Available') && <span className="text-emerald-600 font-black text-[14px] leading-none">Confirmed</span>}
                               {fuel.status === 'Likely Available' && <span className="text-emerald-500 font-black text-[14px] leading-none">Likely Available</span>}
                               {fuel.status === 'Empty' && <span className="text-rose-600 font-black text-[14px] leading-none">Empty</span>}
                               {fuel.status === 'Not Sure' && <span className="text-orange-600 font-black text-[14px] leading-none">Not Sure</span>}
                               {fuel.status === 'Unknown' && <span className="text-slate-400 font-black text-[14px] leading-none">Unknown</span>}
                             </div>
                          </div>
                          
                          <div className={`hidden md:flex gap-1.5 transition-opacity duration-300 mt-1 ${isUnknownOrDisputed ? 'opacity-100' : 'opacity-50 hover:opacity-100 focus-within:opacity-100'}`}>
                            <button 
                              onClick={(e) => { e.stopPropagation(); submitReport(station.id, fuel.key, "Available"); }}
                              disabled={submittingKey !== null}
                              className={`flex-1 transition-all duration-300 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold ${submittingKey === `${station.id}-${fuel.key}-Available` ? 'bg-emerald-500 text-white cursor-wait relative' : 'bg-white border border-emerald-100 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white text-emerald-700'}`}
                            >
                              Avail
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); submitReport(station.id, fuel.key, "Empty"); }}
                              disabled={submittingKey !== null}
                              className={`flex-1 transition-all duration-300 py-1.5 rounded-md text-[9px] uppercase tracking-wider font-bold ${submittingKey === `${station.id}-${fuel.key}-Empty` ? 'bg-rose-500 text-white cursor-wait relative' : 'bg-white border border-rose-100 hover:bg-rose-500 hover:border-rose-500 hover:text-white text-rose-700'}`}
                            >
                              Empty
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                );
              })}

              {/* New CTA to add a missing station */}
              <div 
                onClick={() => setIsMissingDrawerOpen(true)}
                className="border-2 border-dashed border-slate-200 rounded-[24px] p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors mt-6"
              >
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <MapPinPlus className="h-5 w-5 text-slate-500" />
                </div>
                <h4 className="font-extrabold text-[15px] text-slate-900 mb-1">Shed is missing?</h4>
                <p className="text-[12px] text-slate-500 font-medium">Help the community by adding it to the map!</p>
              </div>
            </div>
            
            {nearestStations.length === 0 && (
              <div className="text-center py-10 px-4">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <h3 className="text-[15px] font-bold text-slate-900 mb-1">No stations found</h3>
                <p className="text-[13px] text-slate-500 font-medium">Try adjusting your search terms.</p>
              </div>
            )}
          </div>
        </div>

        {/* Minimalist Map Canvas */}
        <div className="absolute inset-0 z-0 [&_.leaflet-control-zoom]:!border-none [&_.leaflet-control-zoom]:!shadow-[0_8px_30px_rgb(0,0,0,0.12)] [&_.leaflet-control-zoom_a]:!text-slate-700 [&_.leaflet-control-zoom_a]:!bg-white/90 [&_.leaflet-control-zoom_a]:!backdrop-blur-md [&_.leaflet-control-attribution]:!bg-white/50 [&_.leaflet-control-attribution]:!backdrop-blur-sm [&_.leaflet-control-attribution]:!text-[10px] [&_.leaflet-control-container]:right-4 [&_.leaflet-control-container]:top-24 [&_.leaflet-pane.leaflet-popup-pane]:z-[600]">
          <MapContainer 
            center={[SRI_LANKA_CENTER.lat, SRI_LANKA_CENTER.lng]} 
            zoom={8} 
            style={{ height: "100%", width: "100%", backgroundColor: '#f8fafc' }}
            zoomControl={false}
          >
            {/* Provide a clean minimalist Zoom Control placed optimally */}
            <ZoomControl position="topright" />
            
            {/* Smoothly pans and zooms to the user's location once it is loaded */}
            <MapUpdater center={userLocation} zoom={14} />
            
            <TileLayer 
              url="https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
            />
            {/* Fallback to simple standard tiles with a greyscale filter for minimalist map feeling */}
            <TileLayer 
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" 
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            />
            
            {filteredStations.map((station) => {
              const displayStatus92 = getDisplayStatus(station.status_92, station.last_updated);
              let markerColor = "grey";
              if (displayStatus92 === "Available") markerColor = "green";
              if (displayStatus92 === "Empty") markerColor = "red";

              const icon = leafletIcon && leafletIcon.default ? leafletIcon.default(markerColor) : undefined;

              return (
                <Marker key={`map-${station.id}`} position={[station.lat, station.lng]} icon={icon}>
                  {/* Tooltip to show text directly on the map surface */}
                  <Tooltip direction="top" offset={[0, -40]} opacity={0.9} className="font-sans font-bold text-[12px] bg-white text-slate-900 border-none shadow-md rounded-lg py-1 px-2">
                    {station.name}
                  </Tooltip>
                  <Popup className="[&_.leaflet-popup-content-wrapper]:rounded-2xl [&_.leaflet-popup-content-wrapper]:shadow-[0_8px_30px_rgb(0,0,0,0.12)] [&_.leaflet-popup-content-wrapper]:border [&_.leaflet-popup-content-wrapper]:border-slate-100 [&_.leaflet-popup-tip]:shadow-none">
                      <div className="w-[220px] p-1 font-sans">
                        <h3 className="font-extrabold text-[15px] text-slate-900 leading-tight mb-1.5">{station.name}</h3>
                        <p className="text-[12px] font-medium text-slate-500 mb-2 truncate">{station.address}</p>
                        
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}${station.google_place_id ? `&query_place_id=${station.google_place_id}` : ''}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mt-3 flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-[13px] font-bold shadow-sm transition-colors"
                        >
                          <Navigation className="h-4 w-4" />
                          Get Directions
                        </a>
                      </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Render User Location Marker if permission granted */}
            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]} icon={leafletIcon?.userLocation}>
                <Tooltip direction="bottom" offset={[0, 10]} opacity={1} permanent className="font-sans font-extrabold text-[10px] uppercase tracking-wider bg-blue-600 text-white border-none shadow-md rounded-full py-0.5 px-2">
                  You are here
                </Tooltip>
              </Marker>
            )}
          </MapContainer>
        </div>
      </div>

      {/* Mobile Interaction Drawer / Modal */}
      {selectedFuel && (
        <div 
          className="fixed inset-0 z-[3000] flex items-end justify-center sm:items-center p-4 bg-slate-900/40 backdrop-blur-sm md:hidden transition-opacity duration-300"
          onClick={() => setSelectedFuel(null)}
        >
          <div 
            className="bg-white/95 backdrop-blur-xl w-full max-w-sm mx-auto rounded-3xl p-6 shadow-2xl border border-white flex flex-col gap-4 text-center animate-in slide-in-from-bottom-8 fade-in duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-2" />
            
            <div className="mb-2">
              <h3 className="text-xl font-extrabold text-slate-900 leading-tight mb-1">{selectedFuel.stationName}</h3>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedFuel.fuelLabel}</p>
            </div>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { submitReport(selectedFuel.stationId, selectedFuel.fuelKey, "Available"); setSelectedFuel(null); }}
                disabled={submittingKey !== null}
                className="w-full bg-emerald-50 border border-emerald-100 hover:bg-emerald-500 hover:border-emerald-500 text-emerald-700 hover:text-white py-4 rounded-2xl text-[14px] font-black uppercase tracking-wider transition-all"
              >
                {submittingKey === `${selectedFuel.stationId}-${selectedFuel.fuelKey}-Available` ? 'Sending...' : 'Mark Available'}
              </button>
              <button 
                onClick={() => { submitReport(selectedFuel.stationId, selectedFuel.fuelKey, "Empty"); setSelectedFuel(null); }}
                disabled={submittingKey !== null}
                className="w-full bg-rose-50 border border-rose-100 hover:bg-rose-500 hover:border-rose-500 text-rose-700 hover:text-white py-4 rounded-2xl text-[14px] font-black uppercase tracking-wider transition-all"
              >
                {submittingKey === `${selectedFuel.stationId}-${selectedFuel.fuelKey}-Empty` ? 'Sending...' : 'Mark Empty'}
              </button>
            </div>
            
            <button 
              onClick={() => setSelectedFuel(null)}
              className="mt-2 text-sm font-bold text-slate-400 p-2 uppercase tracking-wide hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Missing Station Submission Drawer */}
      {isMissingDrawerOpen && (
        <div 
          className="fixed inset-0 z-[4000] flex items-end justify-center sm:items-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setIsMissingDrawerOpen(false)}
        >
          <div 
            className="bg-white/95 backdrop-blur-xl w-full max-w-md mx-auto rounded-3xl p-6 shadow-2xl border border-white flex flex-col gap-4 animate-in slide-in-from-bottom-8 fade-in duration-300 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-2 md:hidden" />
            
            <div className="mb-2 text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <MapPinPlus className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 leading-tight mb-1">Add a New Station</h3>
              <p className="text-sm font-medium text-slate-500">Know a fuel station that isn't on the map? Send it to us for review.</p>
            </div>
            
            <form onSubmit={handleMissingSubmission} className="flex flex-col gap-4 mt-2">
              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-widest mb-1.5 ml-1">Station Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. CEYPETCO - Kirulapone"
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  value={missingStationData.name}
                  onChange={e => setMissingStationData({...missingStationData, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-slate-500 tracking-widest mb-1.5 ml-1">Google Maps Link</label>
                <input 
                  type="url" 
                  required
                  placeholder="https://maps.google.com/..."
                  className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                  value={missingStationData.mapsLink}
                  onChange={e => setMissingStationData({...missingStationData, mapsLink: e.target.value})}
                />
              </div>

              <div className="flex gap-3 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsMissingDrawerOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 uppercase tracking-wide hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmittingMissing || !missingStationData.name || !missingStationData.mapsLink}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white py-3 rounded-xl text-[14px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  {isSubmittingMissing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Station"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
