import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  Timestamp
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9g7l32oBL8iU1PCYghhlqHUGSvNNo-0g",
  authDomain: "rf2smm.firebaseapp.com",
  databaseURL: "https://rf2smm-default-rtdb.firebaseio.com",
  projectId: "rf2smm",
  storageBucket: "rf2smm.firebasestorage.app",
  messagingSenderId: "738689283525",
  appId: "1:738689283525:web:3d4463c5b1b8167e31c7ac",
  measurementId: "G-6N4GZML6EK"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Default initial services with REAL SMMGen API Service IDs (+20% price markup included)
export const DEFAULT_SERVICES = [
  // ==================== FACEBOOK SERVICES ====================
  {
    category: "Facebook Services",
    name: "FB Page / Profile Followers | 30D Auto Refill",
    price: 144, // 120 + 20%
    min: 10,
    max: 100000,
    desc: "Instant start. High quality non-drop profile/page followers with 30-day auto refill guarantee.",
    apiServiceId: "15806"
  },
  {
    category: "Facebook Services",
    name: "FB Profile / Page Followers | Non Drop Lifetime",
    price: 168,
    min: 10,
    max: 1000000,
    desc: "High quality global real profile/page followers with high retention.",
    apiServiceId: "15353"
  },
  {
    category: "Facebook Services",
    name: "FB Post Likes | Fast Speed Real",
    price: 54, // 45 + 20%
    min: 10,
    max: 1000000,
    desc: "Instant start. 100% active profile post likes with high retention.",
    apiServiceId: "16869"
  },
  {
    category: "Facebook Services",
    name: "FB Page Likes + Followers Combo | HQ",
    price: 180,
    min: 10,
    max: 50000,
    desc: "Page likes and followers combination package for page growth.",
    apiServiceId: "19527"
  },
  {
    category: "Facebook Services",
    name: "FB Video Views | Watch Time Booster",
    price: 96,
    min: 500,
    max: 1000000,
    desc: "Super fast speed video views for Facebook monetization.",
    apiServiceId: "18742"
  },
  {
    category: "Facebook Services",
    name: "FB Reels Views | Instant Viral",
    price: 30,
    min: 1000,
    max: 5000000,
    desc: "Boost your Facebook Reels ranking instantly.",
    apiServiceId: "19544"
  },
  {
    category: "Facebook Services",
    name: "FB Post Comments | Custom Positive",
    price: 240,
    min: 10,
    max: 10000,
    desc: "Custom Bangladeshi / Global comments for Facebook posts.",
    apiServiceId: "15246"
  },
  {
    category: "Facebook Services",
    name: "FB Group Members | Public / Private Group",
    price: 156,
    min: 100,
    max: 500000,
    desc: "Adds real looking members to public or private Facebook groups.",
    apiServiceId: "15805"
  },

  // ==================== INSTAGRAM SERVICES ====================
  {
    category: "Instagram Services",
    name: "IG Real Followers | Premium Active",
    price: 180, // 150 + 20%
    min: 100,
    max: 100000,
    desc: "Speed 10k-50k/day. Real looking accounts with active stories.",
    apiServiceId: "19382"
  },
  {
    category: "Instagram Services",
    name: "IG Followers | Budget Fast Speed",
    price: 120,
    min: 100,
    max: 1000000,
    desc: "Cheapest Instagram followers with ultra fast delivery speed.",
    apiServiceId: "15069"
  },
  {
    category: "Instagram Services",
    name: "IG Likes | HQ Instant Delivery",
    price: 42, // 35 + 20%
    min: 10,
    max: 1000000,
    desc: "Instant delivery. Boosts post ranking and explore algorithm.",
    apiServiceId: "13330"
  },
  {
    category: "Instagram Services",
    name: "IG Reels Views | Viral Fast",
    price: 24,
    min: 1000,
    max: 10000000,
    desc: "Ultra fast delivery for Instagram Reels views.",
    apiServiceId: "19544"
  },
  {
    category: "Instagram Services",
    name: "IG Story Views | All Active Stories",
    price: 36,
    min: 100,
    max: 100000,
    desc: "Views all active stories on your profile instantly.",
    apiServiceId: "19528"
  },
  {
    category: "Instagram Services",
    name: "IG Comments | Custom Emoji & Text",
    price: 288,
    min: 10,
    max: 10000,
    desc: "Custom high quality comments for Instagram posts/reels.",
    apiServiceId: "15246"
  },
  {
    category: "Instagram Services",
    name: "IG Post Saves & Shares | Explore Booster",
    price: 48,
    min: 100,
    max: 100000,
    desc: "Increases Instagram algorithm engagement score.",
    apiServiceId: "19544"
  },

  // ==================== TIKTOK SERVICES ====================
  {
    category: "TikTok Services",
    name: "TikTok Followers | Real HQ Accounts",
    price: 216, // 180 + 20%
    min: 100,
    max: 200000,
    desc: "High quality global TikTok followers with quick start.",
    apiServiceId: "16393"
  },
  {
    category: "TikTok Services",
    name: "TikTok Video Likes | Fast Speed",
    price: 48, // 40 + 20%
    min: 50,
    max: 5000000,
    desc: "Instant delivery for TikTok videos. Helps get on For You page.",
    apiServiceId: "16356"
  },
  {
    category: "TikTok Services",
    name: "TikTok Video Views | Instant Booster",
    price: 18,
    min: 1000,
    max: 50000000,
    desc: "Instant high volume TikTok views.",
    apiServiceId: "16881"
  },
  {
    category: "TikTok Services",
    name: "TikTok Shares & Saves | FYP Booster",
    price: 36,
    min: 100,
    max: 1000000,
    desc: "Increases post engagement signals for TikTok algorithm.",
    apiServiceId: "16881"
  },
  {
    category: "TikTok Services",
    name: "TikTok Custom Comments | Random / Custom",
    price: 300,
    min: 10,
    max: 10000,
    desc: "Real looking TikTok profile comments.",
    apiServiceId: "15246"
  },

  // ==================== YOUTUBE SERVICES ====================
  {
    category: "YouTube Services",
    name: "YouTube Subscribers | Fast Delivery",
    price: 540, // 450 + 20%
    min: 10,
    max: 100000,
    desc: "Instant start channel subscribers.",
    apiServiceId: "9622"
  },
  {
    category: "YouTube Services",
    name: "YouTube Subscribers | Non-Drop Guarantee",
    price: 720,
    min: 100,
    max: 50000,
    desc: "High retention realistic subscribers for channel growth.",
    apiServiceId: "9575"
  },
  {
    category: "YouTube Services",
    name: "YouTube Video Views | High Retention",
    price: 108, // 90 + 20%
    min: 500,
    max: 1000000,
    desc: "Real user views with high watch time.",
    apiServiceId: "18918"
  },
  {
    category: "YouTube Services",
    name: "YouTube Shorts Views | Instant Viral",
    price: 60,
    min: 1000,
    max: 5000000,
    desc: "High speed views for YouTube Shorts videos.",
    apiServiceId: "18918"
  },
  {
    category: "YouTube Services",
    name: "YouTube Video Likes | High Quality",
    price: 120,
    min: 50,
    max: 100000,
    desc: "Positive likes for YouTube videos.",
    apiServiceId: "16869"
  },
  {
    category: "YouTube Services",
    name: "YouTube Watch Time | 4000 Hours Package",
    price: 1800,
    min: 100,
    max: 4000,
    desc: "Watch time hours for YouTube channel monetization requirements.",
    apiServiceId: "18918"
  },

  // ==================== TELEGRAM SERVICES ====================
  {
    category: "Telegram Services",
    name: "Telegram Channel Members | Fast Speed",
    price: 102, // 85 + 20%
    min: 10,
    max: 1000000,
    desc: "Public or private channel link supported. Fast delivery.",
    apiServiceId: "18384"
  },
  {
    category: "Telegram Services",
    name: "Telegram Group Members | Real Active",
    price: 120,
    min: 100,
    max: 500000,
    desc: "Adds members to public or private Telegram groups.",
    apiServiceId: "18384"
  },
  {
    category: "Telegram Services",
    name: "Telegram Post Views | Instant Speed",
    price: 18,
    min: 100,
    max: 1000000,
    desc: "Instant view boost for Telegram channel posts.",
    apiServiceId: "18384"
  },
  {
    category: "Telegram Services",
    name: "Telegram Post Reactions | Likes / Fire / Heart",
    price: 30,
    min: 100,
    max: 100000,
    desc: "Positive emoji reactions on Telegram posts.",
    apiServiceId: "18384"
  },

  // ==================== TWITTER / X SERVICES ====================
  {
    category: "Twitter / X Services",
    name: "Twitter / X Followers | Real HQ",
    price: 240,
    min: 100,
    max: 100000,
    desc: "High quality X (Twitter) profile followers.",
    apiServiceId: "15806"
  },
  {
    category: "Twitter / X Services",
    name: "Twitter / X Likes & Retweets Combo",
    price: 150,
    min: 50,
    max: 50000,
    desc: "Instant engagement for X tweets.",
    apiServiceId: "16869"
  },
  {
    category: "Twitter / X Services",
    name: "Twitter / X Post Impressions & Views",
    price: 24,
    min: 1000,
    max: 10000000,
    desc: "Boost X post view count and impressions.",
    apiServiceId: "19544"
  },

  // ==================== SPOTIFY SERVICES ====================
  {
    category: "Spotify Services",
    name: "Spotify Song Plays | Premium Listeners",
    price: 72,
    min: 1000,
    max: 10000000,
    desc: "Royalty eligible real Spotify track plays.",
    apiServiceId: "18918"
  },
  {
    category: "Spotify Services",
    name: "Spotify Artist Followers | Non-Drop",
    price: 144,
    min: 100,
    max: 500000,
    desc: "Followers for Spotify Artist or User profiles.",
    apiServiceId: "15806"
  },

  // ==================== DISCORD SERVICES ====================
  {
    category: "Discord Services",
    name: "Discord Server Members | Offline Accounts",
    price: 180,
    min: 100,
    max: 100000,
    desc: "Instant server members for Discord communities.",
    apiServiceId: "18384"
  },
  {
    category: "Discord Services",
    name: "Discord Server Members | Online Active",
    price: 360,
    min: 100,
    max: 50000,
    desc: "Members showing online green status in your Discord server.",
    apiServiceId: "18384"
  },

  // ==================== LINKEDIN SERVICES ====================
  {
    category: "LinkedIn Services",
    name: "LinkedIn Followers | Profile / Company Page",
    price: 360,
    min: 100,
    max: 50000,
    desc: "Professional looking LinkedIn followers.",
    apiServiceId: "15806"
  },
  {
    category: "LinkedIn Services",
    name: "LinkedIn Post Likes & Reactions",
    price: 240,
    min: 50,
    max: 20000,
    desc: "Celebrations, Likes, and Insightful reactions on LinkedIn posts.",
    apiServiceId: "16869"
  },

  // ==================== SNAPCHAT & THREADS ====================
  {
    category: "Snapchat & Threads",
    name: "Snapchat Profile Followers | Fast",
    price: 300,
    min: 100,
    max: 50000,
    desc: "Followers for public Snapchat profiles.",
    apiServiceId: "15806"
  },
  {
    category: "Snapchat & Threads",
    name: "Threads Followers & Likes",
    price: 216,
    min: 100,
    max: 100000,
    desc: "Instant followers and likes for Threads by Instagram.",
    apiServiceId: "19382"
  },

  // ==================== WEBSITE TRAFFIC ====================
  {
    category: "Website Traffic",
    name: "Organic Web Visitors | Worldwide Real",
    price: 48,
    min: 1000,
    max: 1000000,
    desc: "Safe real human web traffic for websites and blogs.",
    apiServiceId: "18918"
  },
  {
    category: "Website Traffic",
    name: "Google Search Keyword Traffic | High Retention",
    price: 72,
    min: 1000,
    max: 500000,
    desc: "Targeted keyword traffic from Google search engine.",
    apiServiceId: "18918"
  }
];

export {
  doc,
  collection,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  Timestamp
};
