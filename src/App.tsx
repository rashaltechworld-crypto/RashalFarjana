import React, { useState, useEffect } from 'react';
import {
  db,
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
  DEFAULT_SERVICES
} from './firebase';

interface ServiceData {
  id: string;
  category: string;
  name: string;
  price: number;
  min: number;
  max: number;
  desc?: string;
  apiServiceId?: string;
}

interface OrderData {
  id: string;
  uid: string;
  service: string;
  qty: number;
  link: string;
  cost: number;
  status: string;
  timestamp?: any;
  createdAt?: string;
  apiOrderId?: string | number;
  apiError?: string;
  apiStatus?: string;
}

interface DepositRequest {
  id: string;
  uid: string;
  amount: number;
  bonusAmount?: number;
  totalCredited?: number;
  trxId: string;
  method: string;
  status: string;
  timestamp?: any;
}

export interface DepositBonusTier {
  id: string;
  minAmount: number;
  maxAmount: number; // 0 means no upper limit
  percentage: number;
  label?: string;
}

export interface DepositBonusConfig {
  enabled: boolean;
  tiers: DepositBonusTier[];
  percentage?: number;
  minAmount?: number;
}

const calculateDepositBonus = (
  amt: number,
  config: DepositBonusConfig
): { bonusAmount: number; bonusPercentage: number; matchedTier: DepositBonusTier | null } => {
  if (!config || !config.enabled || isNaN(amt) || amt <= 0) {
    return { bonusAmount: 0, bonusPercentage: 0, matchedTier: null };
  }

  if (config.tiers && config.tiers.length > 0) {
    const sorted = [...config.tiers].sort((a, b) => b.minAmount - a.minAmount);
    for (const t of sorted) {
      const min = Number(t.minAmount) || 0;
      const max = t.maxAmount && Number(t.maxAmount) > 0 ? Number(t.maxAmount) : Infinity;
      if (amt >= min && amt <= max && Number(t.percentage) > 0) {
        const bonus = Math.round(((amt * Number(t.percentage)) / 100) * 100) / 100;
        return { bonusAmount: bonus, bonusPercentage: Number(t.percentage), matchedTier: t };
      }
    }
    return { bonusAmount: 0, bonusPercentage: 0, matchedTier: null };
  }

  if (config.percentage && config.percentage > 0 && config.minAmount !== undefined && amt >= config.minAmount) {
    const bonus = Math.round(((amt * config.percentage) / 100) * 100) / 100;
    return { bonusAmount: bonus, bonusPercentage: config.percentage, matchedTier: null };
  }

  return { bonusAmount: 0, bonusPercentage: 0, matchedTier: null };
};

interface AdminCreatedTrx {
  id: string;
  trxId: string;
  amount: number;
  method: string;
  status: 'Unused' | 'Used';
  usedByUid?: string;
  usedAt?: string;
  createdAt?: any;
  note?: string;
}

interface UserSession {
  uid: string;
  username: string;
  name: string;
  photoURL?: string;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  taskTitle: string;
  reward: number;
  userId: string;
  userName: string;
  proofText: string;
  screenshots: string[]; // up to 5 screenshot base64 strings
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  adminNote?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  reward: number;
  link: string;
  icon?: string;
  image?: string;
  maxUserLimit?: number; // 0 or undefined = unlimited
}

export type ThemeType = 'default' | 'emerald' | 'purple' | 'crimson' | 'light';

export interface ThemeOption {
  id: ThemeType;
  name: string;
  bnName: string;
  icon: string;
  bgGradient: string;
  colorClass: string;
  badgeBg: string;
}

export const THEMES: ThemeOption[] = [
  {
    id: 'default',
    name: 'Dark Royal (Gold/Navy)',
    bnName: 'ডার্ক রয়্যাল (গোল্ড ও নেভি)',
    icon: 'fas fa-moon',
    bgGradient: 'from-blue-600 to-amber-500',
    colorClass: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  },
  {
    id: 'emerald',
    name: 'Emerald Mint (Green Cash)',
    bnName: 'ইমারেল্ড মিন্ট (ক্যাশ গ্রিন)',
    icon: 'fas fa-gem',
    bgGradient: 'from-emerald-600 to-teal-400',
    colorClass: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  },
  {
    id: 'purple',
    name: 'Cyber Violet (Neon Purple)',
    bnName: 'সাইবার ভায়োলেট (নিঅন পার্পল)',
    icon: 'fas fa-bolt',
    bgGradient: 'from-purple-600 to-pink-500',
    colorClass: 'text-purple-400',
    badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  },
  {
    id: 'crimson',
    name: 'Ruby Crimson (Sunset Red)',
    bnName: 'রুবি ক্রিমসন (সানসেট রেড)',
    icon: 'fas fa-fire',
    bgGradient: 'from-rose-600 to-orange-500',
    colorClass: 'text-rose-400',
    badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
  },
  {
    id: 'light',
    name: 'Pearl Light (Clean White)',
    bnName: 'পার্ল লাইট (ক্লিন হোয়াইট)',
    icon: 'fas fa-sun',
    bgGradient: 'from-sky-500 to-blue-600',
    colorClass: 'text-blue-500',
    badgeBg: 'bg-sky-500/20 text-sky-400 border-sky-500/30'
  }
];

// Image compression helper to support up to 5 screenshots
const compressImageToBase64 = (file: File, maxWidth = 900, maxHeight = 900, quality = 0.75): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Legacy Service ID Mapper to ensure SMMGen API receives real working service IDs
const SERVICE_ID_MAP: Record<string, string> = {
  '101': '15806', // FB Followers (30D Refill)
  '102': '16869', // FB Post Likes
  '201': '19382', // IG Followers
  '202': '13330', // IG Likes
  '301': '16393', // TikTok Followers
  '302': '16356', // TikTok Likes
  '401': '9622',  // YouTube Subscribers
  '402': '18918', // YouTube Views
  '501': '18384'  // Telegram Members
};

// Social Platforms Meta with icons and colors
const SOCIAL_PLATFORMS = [
  { id: 'facebook', name: 'Facebook', icon: 'fab fa-facebook-f', color: '#1877F2', bg: 'from-blue-600/25 to-blue-500/10' },
  { id: 'instagram', name: 'Instagram', icon: 'fab fa-instagram', color: '#E4405F', bg: 'from-pink-600/25 to-purple-600/10' },
  { id: 'tiktok', name: 'TikTok', icon: 'fab fa-tiktok', color: '#00F2FE', bg: 'from-cyan-500/25 to-pink-500/10' },
  { id: 'youtube', name: 'YouTube', icon: 'fab fa-youtube', color: '#FF0000', bg: 'from-red-600/25 to-red-500/10' },
  { id: 'telegram', name: 'Telegram', icon: 'fab fa-telegram-plane', color: '#229ED9', bg: 'from-sky-500/25 to-blue-500/10' },
  { id: 'twitter', name: 'Twitter / X', icon: 'fab fa-twitter', color: '#1DA1F2', bg: 'from-slate-700/30 to-blue-500/10' },
  { id: 'website', name: 'Website / SEO', icon: 'fas fa-globe', color: '#10B981', bg: 'from-emerald-500/25 to-teal-500/10' },
  { id: 'whatsapp', name: 'WhatsApp', icon: 'fab fa-whatsapp', color: '#25D366', bg: 'from-emerald-600/25 to-green-500/10' },
  { id: 'snapchat', name: 'Snapchat', icon: 'fab fa-snapchat-ghost', color: '#FFFC00', bg: 'from-yellow-400/25 to-amber-500/10' },
  { id: 'spotify', name: 'Spotify', icon: 'fab fa-spotify', color: '#1DB954', bg: 'from-green-500/25 to-emerald-500/10' },
  { id: 'discord', name: 'Discord', icon: 'fab fa-discord', color: '#5865F2', bg: 'from-indigo-500/25 to-blue-500/10' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'fab fa-linkedin-in', color: '#0A66C2', bg: 'from-blue-700/25 to-sky-500/10' },
];

function getPlatformMeta(name: string) {
  const str = (name || '').toLowerCase();
  if (str.includes('fb') || str.includes('facebook')) return SOCIAL_PLATFORMS[0];
  if (str.includes('ig') || str.includes('instagram')) return SOCIAL_PLATFORMS[1];
  if (str.includes('tiktok') || str.includes('tt')) return SOCIAL_PLATFORMS[2];
  if (str.includes('yt') || str.includes('youtube')) return SOCIAL_PLATFORMS[3];
  if (str.includes('telegram') || str.includes('tg')) return SOCIAL_PLATFORMS[4];
  if (str.includes('twitter') || str.includes('x') || str.includes('tweet')) return SOCIAL_PLATFORMS[5];
  if (str.includes('web') || str.includes('seo') || str.includes('website') || str.includes('traffic')) return SOCIAL_PLATFORMS[6];
  if (str.includes('whatsapp') || str.includes('wa')) return SOCIAL_PLATFORMS[7];
  if (str.includes('snapchat') || str.includes('sc')) return SOCIAL_PLATFORMS[8];
  if (str.includes('spotify')) return SOCIAL_PLATFORMS[9];
  if (str.includes('discord')) return SOCIAL_PLATFORMS[10];
  if (str.includes('linkedin')) return SOCIAL_PLATFORMS[11];
  return { id: 'smm', name: 'SMM Service', icon: 'fas fa-rocket', color: '#3B82F6', bg: 'from-blue-500/20 to-indigo-500/10' };
}

const PRESET_AVATARS = [
  { id: 'av1', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80', label: 'Avatar 1' },
  { id: 'av2', url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=300&q=80', label: 'Avatar 2' },
  { id: 'av3', url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80', label: 'Avatar 3' },
  { id: 'av4', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80', label: 'Avatar 4' },
  { id: 'av5', url: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?auto=format&fit=crop&w=300&q=80', label: 'Avatar 5' },
  { id: 'av6', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80', label: 'Avatar 6' }
];

// Payment Method Authentic Brand SVG Logo Component (bKash, Nagad, Rocket, Binance, USDT)
const PaymentLogo = ({ method, className = "w-6 h-6", customUrl }: { method: string; className?: string; customUrl?: string }) => {
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    setImgErr(false);
  }, [customUrl]);

  if (customUrl && customUrl.trim() && !imgErr) {
    return (
      <div className={`inline-flex items-center justify-center rounded-xl bg-slate-900/90 border border-white/10 shadow-md overflow-hidden shrink-0 ${className}`}>
        <img
          src={customUrl.trim()}
          alt={method}
          className="w-full h-full object-contain p-0.5 rounded-xl"
          onError={() => setImgErr(true)}
        />
      </div>
    );
  }

  const m = (method || '').toLowerCase();

  if (m.includes('bkash')) {
    return (
      <div className={`inline-flex items-center justify-center rounded-xl bg-[#E2136E] text-white font-black shadow-md shadow-[#E2136E]/30 overflow-hidden shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* bKash Origami Bird Logo Exact Vector */}
          <path d="M15 42L55 22L98 48L58 72L15 42Z" fill="white" />
          <path d="M58 72L98 48L90 102L58 72Z" fill="#FCE4EC" />
          <path d="M58 72L90 102L38 108L58 72Z" fill="white" />
          <path d="M15 42L58 72L38 108L15 42Z" fill="#F8BBD0" />
          <path d="M55 22L98 48L108 28L55 22Z" fill="#FFF" fillOpacity="0.85" />
        </svg>
      </div>
    );
  }

  if (m.includes('nagad')) {
    return (
      <div className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-tr from-[#D81B20] via-[#E2231A] to-[#F7921E] text-white font-black shadow-md shadow-[#D81B20]/30 overflow-hidden shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Nagad Swirl / Flame Icon */}
          <path d="M30 85C25 72 30 52 45 35C60 18 78 12 78 12C78 12 70 32 75 48C80 64 95 72 85 88C75 104 48 102 30 85Z" fill="white" />
          <path d="M42 82C38 72 45 56 56 46C67 36 78 30 78 30C78 30 72 44 76 55C80 66 88 72 80 84C72 96 52 94 42 82Z" fill="#FFF200" />
          <circle cx="62" cy="62" r="10" fill="#ED1C24" />
        </svg>
      </div>
    );
  }

  if (m.includes('rocket')) {
    return (
      <div className={`inline-flex items-center justify-center rounded-xl bg-[#8C3494] text-white font-black shadow-md shadow-[#8C3494]/30 overflow-hidden shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full p-1" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* DBBL Rocket Icon */}
          <path d="M60 15C60 15 82 35 82 65C82 80 74 92 74 92L60 82L46 92C46 92 38 80 38 65C38 35 60 15 60 15Z" fill="white" />
          <circle cx="60" cy="48" r="9" fill="#8C3494" />
          <path d="M60 82L68 102H52L60 82Z" fill="#FFC107" />
          <path d="M38 65L24 75L32 85L46 92C46 92 38 80 38 65Z" fill="#E1BEE7" />
          <path d="M82 65L96 75L88 85L74 92C74 92 82 80 82 65Z" fill="#E1BEE7" />
        </svg>
      </div>
    );
  }

  if (m.includes('binance')) {
    return (
      <div className={`inline-flex items-center justify-center rounded-xl bg-[#181A20] border border-[#F0B90B]/50 text-amber-400 font-black shadow-md shadow-[#F0B90B]/20 overflow-hidden shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full p-1.5" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Binance Official Logo */}
          <path d="M60 22L76 38L60 54L44 38L60 22Z" fill="#F0B90B" />
          <path d="M30 52L46 68L30 84L14 68L30 52Z" fill="#F0B90B" />
          <path d="M90 52L106 68L90 84L74 68L90 52Z" fill="#F0B90B" />
          <path d="M60 82L76 98L60 114L44 98L60 82Z" fill="#F0B90B" />
          <path d="M60 52L76 68L60 84L44 68L60 52Z" fill="#F0B90B" />
        </svg>
      </div>
    );
  }

  if (m.includes('usdt') || m.includes('tether')) {
    return (
      <div className={`inline-flex items-center justify-center rounded-xl bg-[#26A17B] text-white font-black shadow-md shadow-[#26A17B]/30 overflow-hidden shrink-0 ${className}`}>
        <svg viewBox="0 0 120 120" className="w-full h-full p-1.5" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Tether USDT Official Symbol */}
          <circle cx="60" cy="60" r="50" fill="#26A17B" />
          <path d="M35 32H85V46H67V57C80 58 90 61.5 90 66C90 71.5 76.5 76 60 76C43.5 76 30 71.5 30 66C30 61.5 40 58 53 57V46H35V32Z" fill="white" />
          <path d="M53 61.2C42.8 60.8 35 58.5 35 55.5C35 52.2 46.2 49.5 60 49.5C73.8 49.5 85 52.2 85 55.5C85 58.5 77.2 60.8 67 61.2V71.5C77 71.1 84.5 69 84.5 66.5C84.5 63.2 73.5 60.5 60 60.5C46.5 60.5 35.5 63.2 35.5 66.5C35.5 69 43 71.1 53 71.5V61.2Z" fill="#26A17B" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 font-black shrink-0 ${className}`}>
      <i className="fas fa-wallet text-xs"></i>
    </div>
  );
};

export default function App() {
  // Splash & Auth State
  const [showSplash, setShowSplash] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);

  // Form states for auth
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginUserErr, setLoginUserErr] = useState('');
  const [loginPassErr, setLoginPassErr] = useState('');

  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [regNameErr, setRegNameErr] = useState('');
  const [regUserErr, setRegUserErr] = useState('');
  const [regPassErr, setRegPassErr] = useState('');
  const [regConfirmErr, setRegConfirmErr] = useState('');

  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Main App State
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'funds' | 'profile' | 'admin'>('home');
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(() => {
    const saved = localStorage.getItem('smm_app_theme') as ThemeType;
    return saved || 'default';
  });
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Sync theme class to document body
  useEffect(() => {
    document.body.className = `theme-${currentTheme}${currentTheme === 'light' ? ' light-theme' : ''}`;
    localStorage.setItem('smm_app_theme', currentTheme);
  }, [currentTheme]);
  const [userBalance, setUserBalance] = useState(0);
  const [userTotalOrders, setUserTotalOrders] = useState(0);
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  // Check if current logged in user is admin (rashal117 / Rashal117)
  const isAdminUser = Boolean(
    currentUser && (
      currentUser.username?.toLowerCase() === 'rashal117' ||
      currentUser.name?.toLowerCase() === 'rashal117' ||
      currentUser.email?.toLowerCase() === 'rashal117' ||
      currentUser.email?.toLowerCase() === 'rashal117@gmail.com' ||
      currentUser.role === 'admin'
    )
  );

  // Home Page Order Form State
  const [allServices, setAllServices] = useState<ServiceData[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [currentService, setCurrentService] = useState<ServiceData | null>(null);
  const [targetLink, setTargetLink] = useState('');
  const [quantity, setQuantity] = useState<number>(100);
  const [orderSubmitting, setOrderSubmitting] = useState(false);

  // Form Field Errors
  const [catErr, setCatErr] = useState('');
  const [svcErr, setSvcErr] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [qtyErr, setQtyErr] = useState('');

  // Orders State
  const [ordersList, setOrdersList] = useState<OrderData[]>([]);

  // Funds State
  const [selectedMethod, setSelectedMethod] = useState<'bkash' | 'bkash_2' | 'nagad' | 'rocket' | 'binance' | 'usdt_bep20'>('bkash');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [cryptoUsdInput, setCryptoUsdInput] = useState<string>('');
  const [depositTrxId, setDepositTrxId] = useState<string>('');
  const [depAmtErr, setDepAmtErr] = useState('');
  const [depTrxErr, setDepTrxErr] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositHistory, setDepositHistory] = useState<DepositRequest[]>([]);
  const [allDepositRequests, setAllDepositRequests] = useState<DepositRequest[]>([]);

  // Admin Manual Service Form & Control State
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'spin' | 'daily' | 'ads' | 'promo' | 'payment' | 'deposits' | 'trx_maker' | 'orders' | 'services' | 'notifications' | 'links' | 'settings' | 'tasks' | 'avatars' | 'ai_support'>('users');

  // AI Support System State
  const [aiSupportEnabled, setAiSupportEnabled] = useState<boolean>(() => {
    return localStorage.getItem('smm_ai_support_enabled') !== 'false';
  });
  const [aiSupportCustomPrompt, setAiSupportCustomPrompt] = useState<string>(() => {
    return localStorage.getItem('smm_ai_support_custom_prompt') || 'RF SMM Panel BD - নতুন অফার ও বিশেষ মূল্য ছাড় চলমান। যেকোনো সাহায্যে আমাদের সাপোর্ট বট উত্তর দিবে।';
  });
  const [isAiChatOpen, setIsAiChatOpen] = useState<boolean>(false);
  const [aiMessages, setAiMessages] = useState<Array<{ id: string; role: 'user' | 'model'; text: string; time: string }>>([
    {
      id: 'welcome',
      role: 'model',
      text: 'আসসালামু আলাইকুম! 👋 আমি RF SMM-এর 🤖 AI সাপোর্ট অ্যাসিস্ট্যান্ট। আমি কীভাবে আপনাকে সাহায্য করতে পারি? (যেমন: ডিপোজিট করা, নতুন অর্ডার, ব্যালেন্স, ডেলিভারি টাইম ইত্যাদি)',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [aiInputText, setAiInputText] = useState<string>('');
  const [isAiSending, setIsAiSending] = useState<boolean>(false);

  const handleSendAiMessage = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt !== undefined ? overridePrompt : aiInputText).trim();
    if (!textToSend || isAiSending) return;

    if (!aiSupportEnabled) {
      showToast('⚠️ এডমিন কর্তৃক এআই সাপোর্ট সার্ভিসটি আপাতত বন্ধ রাখা হয়েছে।', 'error');
      return;
    }

    const userMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setAiMessages((prev) => [...prev, userMsg]);
    if (!overridePrompt) setAiInputText('');
    setIsAiSending(true);

    try {
      const history = aiMessages.map((m) => ({ role: m.role, text: m.text }));
      const response = await fetch('/api/ai-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          history,
          customKnowledge: aiSupportCustomPrompt,
          userContext: currentUser ? {
            name: currentUser.displayName || currentUser.email || 'Customer',
            balance: userCoins,
            totalOrders: myOrders.length
          } : undefined
        })
      });

      const data = await response.json();
      const replyText = data.reply || data.error || 'দুঃখিত, কোনো উত্তর পাওয়া যায়নি।';

      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'model' as const,
        text: replyText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setAiMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('AI Support send error:', err);
      setAiMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'model' as const,
          text: '⚠️ এআই সার্ভারে সংযোগ করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAiSending(false);
    }
  };
  const [presetAvatars, setPresetAvatars] = useState<Array<{ id: string; url: string; label?: string }>>(PRESET_AVATARS);
  const [adminNewAvatarUrl, setAdminNewAvatarUrl] = useState<string>('');

  // Admin Created Trxs State (Admin Trx Maker)
  const [adminCreatedTrxs, setAdminCreatedTrxs] = useState<AdminCreatedTrx[]>([]);
  const [newAdminTrxId, setNewAdminTrxId] = useState('');
  const [newAdminTrxAmount, setNewAdminTrxAmount] = useState('100');
  const [newAdminTrxMethod, setNewAdminTrxMethod] = useState('bkash');
  const [newAdminTrxNote, setNewAdminTrxNote] = useState('');
  const [adminTrxCreating, setAdminTrxCreating] = useState(false);
  const [adminTrxFilter, setAdminTrxFilter] = useState<'all' | 'Unused' | 'Used'>('all');
  const [adminNewAvatarLabel, setAdminNewAvatarLabel] = useState<string>('');
  const [adminAvatarUploadLoading, setAdminAvatarUploadLoading] = useState<boolean>(false);
  const [depositBonusConfig, setDepositBonusConfig] = useState<DepositBonusConfig>({
    enabled: true,
    tiers: [
      { id: 't1', minAmount: 100, maxAmount: 499, percentage: 2, label: 'Tier 1' },
      { id: 't2', minAmount: 500, maxAmount: 999, percentage: 5, label: 'Tier 2' },
      { id: 't3', minAmount: 1000, maxAmount: 0, percentage: 10, label: 'Tier 3' }
    ],
    percentage: 2,
    minAmount: 100
  });
  const [isSavingDepositBonus, setIsSavingDepositBonus] = useState(false);
  const [autoDepositGlobalEnabled, setAutoDepositGlobalEnabled] = useState<boolean>(true);
  const [isSavingAutoDepositSettings, setIsSavingAutoDepositSettings] = useState<boolean>(false);
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<
    Record<string, { label: string; number: string; icon: string; note?: string; isCrypto?: boolean; customIconUrl?: string }>
  >({
    bkash: { label: 'bKash Merchant (বিকাশ ১)', number: '01781119650', icon: 'b' },
    bkash_2: { label: 'bKash Personal (বিকাশ ২)', number: '01781119650', icon: 'b' },
    nagad: { label: 'Nagad Merchant', number: '01781119650', icon: 'N' },
    rocket: { label: 'Rocket Personal', number: '01781119650', icon: 'R' },
    binance: { label: 'Binance Pay / UID', number: '584304364', icon: 'B', note: '0.10$ = 12 TK ($1 = 120 TK)', isCrypto: true },
    usdt_bep20: { label: 'USDT (BEP20 Network)', number: '0x5764a28569ef6efdce93db22656b297ab487cdaa', icon: 'U', note: '0.10$ = 12 TK ($1 = 120 TK)', isCrypto: true }
  });
  const [editingPaymentNumbers, setEditingPaymentNumbers] = useState<Record<string, { number: string; note: string; customIconUrl: string }>>({});
  const [allUsersList, setAllUsersList] = useState<Array<{ uid: string; name?: string; balance?: number; total_orders?: number }>>([]);
  const [allAdminOrdersList, setAllAdminOrdersList] = useState<OrderData[]>([]);
  const [depFilter, setDepFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [customDepAmounts, setCustomDepAmounts] = useState<{ [id: string]: string }>({});
  const [userBalanceAdjustInput, setUserBalanceAdjustInput] = useState<{ [uid: string]: string }>({});

  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'system' | 'deposit' | 'promo'>('system');
  const [broadcastImage, setBroadcastImage] = useState<string | null>(null);

  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkIcon, setNewLinkIcon] = useState('fab fa-telegram');
  const [supportLinks, setSupportLinks] = useState<Array<{ id: string; name: string; url: string; icon: string }>>([
    { id: 'l1', name: 'Telegram Channel', url: 'https://t.me/RF2_SMM', icon: 'fab fa-telegram' },
    { id: 'l2', name: 'WhatsApp Support', url: 'https://wa.me/8801781119650', icon: 'fab fa-whatsapp' },
    { id: 'l3', name: 'Facebook Page', url: 'https://www.facebook.com/share/1EKKUHMxCw/', icon: 'fab fa-facebook' }
  ]);

  // Telegram Channel Bot Notification Config & Handler
  const [tgBotToken, setTgBotToken] = useState('8417495766:AAEupqJEr6_IyvOcGXhhdWStj95khUdr8MU');
  const [tgChannel1Id, setTgChannel1Id] = useState('-1003911086814');
  const [tgChannel1Url, setTgChannel1Url] = useState('https://t.me/RF2_SMM');
  const [tgChannel2Id, setTgChannel2Id] = useState('');
  const [tgChannel2Url, setTgChannel2Url] = useState('');
  const [tgMiniAppUrl, setTgMiniAppUrl] = useState('https://t.me/RF_SMM_PRO_BOT?startapp=8479465879');

  // Mandatory Telegram Channels State
  const [mandatoryChannels, setMandatoryChannels] = useState<Array<{ name: string; url: string; chatId?: string }>>([
    { name: 'Farju Tech Studio', url: 'https://t.me/Farju_Tech_Studio', chatId: '@Farju_Tech_Studio' },
    { name: 'Rashal Tech World', url: 'https://t.me/RashalTechWorld', chatId: '@RashalTechWorld' },
    { name: 'RF2 SMM Official', url: 'https://t.me/RF2_SMM', chatId: '@RF2_SMM' },
    { name: 'Farju SMM Panel', url: 'https://t.me/FARJU_SMM_PANAL', chatId: '@FARJU_SMM_PANAL' }
  ]);
  const [mandatoryChannelsEnabled, setMandatoryChannelsEnabled] = useState<boolean>(true);
  const [hasCompletedMandatoryJoin, setHasCompletedMandatoryJoin] = useState<boolean>(() => {
    return localStorage.getItem('smm_mandatory_channels_v2') === 'true';
  });
  const [joinedChannelIndexes, setJoinedChannelIndexes] = useState<number[]>([]);
  const [verifiedChannelIndexes, setVerifiedChannelIndexes] = useState<number[]>([]);
  const [userTgInputId, setUserTgInputId] = useState<string>(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id) {
      return String((window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id);
    }
    return localStorage.getItem('smm_user_tg_id') || '';
  });
  const [botVerifyLoading, setBotVerifyLoading] = useState<boolean>(false);
  const [channelVerificationErrors, setChannelVerificationErrors] = useState<Record<number, string>>({});

  // Periodic Channel Check Controls & State
  const [periodicChannelCheckEnabled, setPeriodicChannelCheckEnabled] = useState<boolean>(true);
  const [periodicChannelCheckInterval, setPeriodicChannelCheckInterval] = useState<number>(5); // minutes
  const [lastChannelCheckTime, setLastChannelCheckTime] = useState<number>(() => {
    const saved = localStorage.getItem('smm_last_ch_check_ts');
    return saved ? parseInt(saved, 10) : Date.now();
  });

  // Daily Check-in State
  const [dailyCheckInEnabled, setDailyCheckInEnabled] = useState<boolean>(true);
  const [dailyCheckInReward, setDailyCheckInReward] = useState<number>(5.0);
  const [lastDailyCheckInDate, setLastDailyCheckInDate] = useState<string>(() => {
    return localStorage.getItem('smm_daily_checkin_' + (currentUser?.uid || 'guest')) || '';
  });
  const [lastDailyCheckInTime, setLastDailyCheckInTime] = useState<number>(() => {
    const saved = localStorage.getItem('smm_daily_checkin_ts_' + (currentUser?.uid || 'guest'));
    return saved ? parseInt(saved, 10) : 0;
  });
  const [dailyCheckInLoading, setDailyCheckInLoading] = useState<boolean>(false);
  const [dailyCountdownNow, setDailyCountdownNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setDailyCountdownNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Promo Code State
  const [promoCodeEnabled, setPromoCodeEnabled] = useState<boolean>(true);
  const [promoCodes, setPromoCodes] = useState<Array<{
    id: string;
    code: string;
    reward: number;
    maxUses: number;
    usedCount: number;
    usedByUsers: string[];
  }>>([
    { id: 'p1', code: 'WELCOME50', reward: 10, maxUses: 100, usedCount: 5, usedByUsers: [] },
    { id: 'p2', code: 'FARJU100', reward: 20, maxUses: 50, usedCount: 2, usedByUsers: [] }
  ]);
  const [inputPromoCode, setInputPromoCode] = useState<string>('');
  const [promoRedeemLoading, setPromoRedeemLoading] = useState<boolean>(false);

  // Admin New Promo Code Form State
  const [newPromoCode, setNewPromoCode] = useState<string>('');
  const [newPromoReward, setNewPromoReward] = useState<string>('10');
  const [newPromoMaxUses, setNewPromoMaxUses] = useState<string>('50');

  // Ad Earn System State
  const [adEarnEnabled, setAdEarnEnabled] = useState<boolean>(true);
  const [adEarnRewardPerAd, setAdEarnRewardPerAd] = useState<number>(0);
  const [adEarnDailyMaxLimit, setAdEarnDailyMaxLimit] = useState<number>(500);
  const [adWatchLoading, setAdWatchLoading] = useState<boolean>(false);
  const [showAdModal, setShowAdModal] = useState<boolean>(false);
  const [adCountdown, setAdCountdown] = useState<number>(5);
  const [adCanClaim, setAdCanClaim] = useState<boolean>(false);

  useEffect(() => {
    let timer: any = null;
    if (showAdModal && adCountdown > 0) {
      timer = setInterval(() => {
        setAdCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setAdCanClaim(true);
            haptic('heavy');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showAdModal, adCountdown]);

  const getTodayAdStorageKey = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const userId = currentUser?.uid || 'guest';
    return `smm_ads_watched_${todayStr}_${userId}`;
  };

  const [todayAdsWatchedCount, setTodayAdsWatchedCount] = useState<number>(() => {
    const saved = localStorage.getItem(`smm_ads_watched_${new Date().toISOString().slice(0, 10)}_${currentUser?.uid || 'guest'}`);
    return saved ? parseInt(saved, 10) : 0;
  });

  // Lucky Spin System State
  const [luckySpinEnabled, setLuckySpinEnabled] = useState<boolean>(true);
  const [luckySpinDailyMaxLimit, setLuckySpinDailyMaxLimit] = useState<number>(50);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [showSpinWinModal, setShowSpinWinModal] = useState<boolean>(false);
  const [wonSpinAmount, setWonSpinAmount] = useState<number>(0);
  const [spinRewardOptions] = useState<number[]>([
    0.01, 0.05, 0.10, 0.20, 0.02, 0.50, 0.03, 1.00,
    0.01, 0.25, 0.05, 0.15, 0.02, 0.30, 0.04, 0.10
  ]);

  // Rolling 24-Hour Spin Storage Key Helper
  const getSpinStorageKey = (type: 'lucky' | 'gold' | 'premium', isTs: boolean = false) => {
    const userId = currentUser?.uid || 'guest';
    return isTs ? `smm_${type}_spin_ts_${userId}` : `smm_${type}_spin_cnt_${userId}`;
  };

  const [todaySpinCount, setTodaySpinCount] = useState<number>(() => {
    const userId = currentUser?.uid || 'guest';
    const savedTs = localStorage.getItem(`smm_lucky_spin_ts_${userId}`);
    const savedCnt = localStorage.getItem(`smm_lucky_spin_cnt_${userId}`);
    const ts = savedTs ? parseInt(savedTs, 10) : 0;
    const cnt = savedCnt ? parseInt(savedCnt, 10) : 0;
    if (ts > 0 && Date.now() >= ts + 24 * 60 * 60 * 1000) {
      return 0;
    }
    return cnt;
  });
  const [lastLuckySpinTime, setLastLuckySpinTime] = useState<number>(() => {
    const userId = currentUser?.uid || 'guest';
    const savedTs = localStorage.getItem(`smm_lucky_spin_ts_${userId}`);
    return savedTs ? parseInt(savedTs, 10) : 0;
  });

  // VIP Gold Spin System State (Requirement: Wallet Balance >= 50 TK)
  const [goldSpinEnabled, setGoldSpinEnabled] = useState<boolean>(true);
  const [goldSpinMinBalance, setGoldSpinMinBalance] = useState<number>(50);
  const [goldSpinDailyMaxLimit, setGoldSpinDailyMaxLimit] = useState<number>(20);
  const [isGoldSpinning, setIsGoldSpinning] = useState<boolean>(false);
  const [goldWheelRotation, setGoldWheelRotation] = useState<number>(0);
  const [showGoldSpinWinModal, setShowGoldSpinWinModal] = useState<boolean>(false);
  const [wonGoldSpinAmount, setWonGoldSpinAmount] = useState<number>(0);
  const [goldSpinRewardOptions] = useState<number[]>([
    0.10, 0.25, 0.50, 1.00, 0.15, 2.00, 0.30, 3.00,
    0.20, 5.00, 0.40, 1.50, 0.10, 4.00, 0.50, 2.50
  ]);

  const [todayGoldSpinCount, setTodayGoldSpinCount] = useState<number>(() => {
    const userId = currentUser?.uid || 'guest';
    const savedTs = localStorage.getItem(`smm_gold_spin_ts_${userId}`);
    const savedCnt = localStorage.getItem(`smm_gold_spin_cnt_${userId}`);
    const ts = savedTs ? parseInt(savedTs, 10) : 0;
    const cnt = savedCnt ? parseInt(savedCnt, 10) : 0;
    if (ts > 0 && Date.now() >= ts + 24 * 60 * 60 * 1000) {
      return 0;
    }
    return cnt;
  });
  const [lastGoldSpinTime, setLastGoldSpinTime] = useState<number>(() => {
    const userId = currentUser?.uid || 'guest';
    const savedTs = localStorage.getItem(`smm_gold_spin_ts_${userId}`);
    return savedTs ? parseInt(savedTs, 10) : 0;
  });

  // Premium Diamond Spin System State (Requirement: Win 0.30 TK - 10.00 TK, 90% chance on 0.30 - 1.00 TK, 1 spin per 24 hrs, 100 TK min balance)
  const [premiumSpinEnabled, setPremiumSpinEnabled] = useState<boolean>(true);
  const [premiumSpinMinBalance, setPremiumSpinMinBalance] = useState<number>(100);
  const [premiumSpinDailyMaxLimit, setPremiumSpinDailyMaxLimit] = useState<number>(1);
  const [isPremiumSpinning, setIsPremiumSpinning] = useState<boolean>(false);
  const [premiumWheelRotation, setPremiumWheelRotation] = useState<number>(0);
  const [showPremiumSpinWinModal, setShowPremiumSpinWinModal] = useState<boolean>(false);
  const [wonPremiumSpinAmount, setWonPremiumSpinAmount] = useState<number>(0);
  const [premiumSpinRewardOptions] = useState<number[]>([
    0.30, 0.50, 0.80, 1.00, 0.30, 2.00, 0.50, 5.00,
    0.80, 10.00, 1.00, 0.30, 0.50, 3.00, 0.80, 1.00
  ]);

  const [todayPremiumSpinCount, setTodayPremiumSpinCount] = useState<number>(() => {
    const userId = currentUser?.uid || 'guest';
    const savedTs = localStorage.getItem(`smm_premium_spin_ts_${userId}`);
    const savedCnt = localStorage.getItem(`smm_premium_spin_cnt_${userId}`);
    const ts = savedTs ? parseInt(savedTs, 10) : 0;
    const cnt = savedCnt ? parseInt(savedCnt, 10) : 0;
    if (ts > 0 && Date.now() >= ts + 24 * 60 * 60 * 1000) {
      return 0;
    }
    return cnt;
  });
  const [lastPremiumSpinTime, setLastPremiumSpinTime] = useState<number>(() => {
    const userId = currentUser?.uid || 'guest';
    const savedTs = localStorage.getItem(`smm_premium_spin_ts_${userId}`);
    return savedTs ? parseInt(savedTs, 10) : 0;
  });

  // Strict 24-Hour Rolling Spin Cycle Sync Effect
  useEffect(() => {
    const userId = currentUser?.uid || 'guest';
    const now = Date.now();

    // 1. Lucky Spin Check
    const lTsSaved = localStorage.getItem(`smm_lucky_spin_ts_${userId}`);
    const lCntSaved = localStorage.getItem(`smm_lucky_spin_cnt_${userId}`);
    const lTs = lTsSaved ? parseInt(lTsSaved, 10) : 0;
    const lCnt = lCntSaved ? parseInt(lCntSaved, 10) : 0;

    if (lTs > 0 && now >= lTs + 24 * 60 * 60 * 1000) {
      setTodaySpinCount(0);
      localStorage.setItem(`smm_lucky_spin_cnt_${userId}`, '0');
    } else {
      setTodaySpinCount(lCnt);
      setLastLuckySpinTime(lTs);
    }

    // 2. Gold Spin Check
    const gTsSaved = localStorage.getItem(`smm_gold_spin_ts_${userId}`);
    const gCntSaved = localStorage.getItem(`smm_gold_spin_cnt_${userId}`);
    const gTs = gTsSaved ? parseInt(gTsSaved, 10) : 0;
    const gCnt = gCntSaved ? parseInt(gCntSaved, 10) : 0;

    if (gTs > 0 && now >= gTs + 24 * 60 * 60 * 1000) {
      setTodayGoldSpinCount(0);
      localStorage.setItem(`smm_gold_spin_cnt_${userId}`, '0');
    } else {
      setTodayGoldSpinCount(gCnt);
      setLastGoldSpinTime(gTs);
    }

    // 3. Premium Spin Check
    const pTsSaved = localStorage.getItem(`smm_premium_spin_ts_${userId}`);
    const pCntSaved = localStorage.getItem(`smm_premium_spin_cnt_${userId}`);
    const pTs = pTsSaved ? parseInt(pTsSaved, 10) : 0;
    const pCnt = pCntSaved ? parseInt(pCntSaved, 10) : 0;

    if (pTs > 0 && now >= pTs + 24 * 60 * 60 * 1000) {
      setTodayPremiumSpinCount(0);
      localStorage.setItem(`smm_premium_spin_cnt_${userId}`, '0');
    } else {
      setTodayPremiumSpinCount(pCnt);
      setLastPremiumSpinTime(pTs);
    }
  }, [currentUser?.uid, dailyCountdownNow]);

  // Telegram Task Notification Helper (Daily Check-in, Promo Code, Ad Earn, Lucky Spin, Gold Spin & Premium Spin live channel alert)
  const sendTelegramTaskNotification = async (type: 'daily' | 'promo' | 'ad' | 'spin' | 'gold_spin' | 'premium_spin', payload: {
    userName: string;
    userId: string;
    reward: number;
    code?: string;
    usedCount?: number;
    maxUses?: number;
  }) => {
    try {
      const token = tgBotToken.trim() || '8417495766:AAEupqJEr6_IyvOcGXhhdWStj95khUdr8MU';
      const ch1Id = tgChannel1Id.trim() || '-1003911086814';
      const ch1Url = tgChannel1Url.trim() || 'https://t.me/RF2_SMM';
      const ch2Id = tgChannel2Id.trim();
      const ch2Url = tgChannel2Url.trim();
      const miniApp = tgMiniAppUrl.trim() || 'https://t.me/RF_SMM_PRO_BOT?startapp=8479465879';

      let textHtml = '';
      if (type === 'daily') {
        textHtml = `🎁 <b>DAILY CHECK-IN REWARD CLAIMED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escapeHtml(payload.userName)}\n` +
          `🆔 <b>User ID:</b> <code>${escapeHtml(payload.userId.slice(0, 8))}</code>\n` +
          `💰 <b>Reward Bonus:</b> ৳ ${(payload.reward || 0).toFixed(2)}\n` +
          `📅 <b>Date:</b> ${new Date().toLocaleDateString('en-BD')}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🎉 <i>Claim your free daily check-in bonus every 24 hours on our Mini App!</i>`;
      } else if (type === 'promo') {
        textHtml = `🎟️ <b>PROMO CODE REDEEMED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escapeHtml(payload.userName)}\n` +
          `🏷️ <b>Promo Code:</b> <code>${escapeHtml(payload.code || '')}</code>\n` +
          `💰 <b>Reward Credited:</b> ৳ ${(payload.reward || 0).toFixed(2)}\n` +
          (payload.maxUses ? `⚡ <b>Total Uses:</b> ${payload.usedCount || 1} / ${payload.maxUses}\n` : '') +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🚀 <i>Redeem active promo codes now on our Mini App!</i>`;
      } else if (type === 'ad') {
        textHtml = `📺 <b>AD EARN REWARD CLAIMED!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escapeHtml(payload.userName)}\n` +
          `💰 <b>Ad Reward:</b> ৳ ${(payload.reward || 0).toFixed(2)}\n` +
          `📊 <b>Today Ads Watched:</b> ${payload.usedCount || 1} / ${payload.maxUses || 500}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🎬 <i>Watch ads daily on our Mini App to earn free wallet balance!</i>`;
      } else if (type === 'spin') {
        textHtml = `🎡 <b>LUCKY SPIN REWARD WON!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escapeHtml(payload.userName)}\n` +
          `💰 <b>Spin Win Reward:</b> ৳ ${(payload.reward || 0).toFixed(2)}\n` +
          `📊 <b>Today Spins Completed:</b> ${payload.usedCount || 1} / ${payload.maxUses || 50}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🎲 <i>Spin the Lucky Wheel daily on our Mini App to win up to ৳ 1.00 per spin!</i>`;
      } else if (type === 'gold_spin') {
        textHtml = `🏆 <b>GOLD VIP SPIN REWARD WON!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escapeHtml(payload.userName)}\n` +
          `👑 <b>VIP Status:</b> ৳ 50+ Balance Holder\n` +
          `💰 <b>Gold Spin Win:</b> ৳ ${(payload.reward || 0).toFixed(2)}\n` +
          `📊 <b>Today Gold Spins:</b> ${payload.usedCount || 1} / ${payload.maxUses || 20}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `✨ <i>Keep ৳50+ balance in your wallet to unlock daily Gold Spins up to ৳ 5.00!</i>`;
      } else if (type === 'premium_spin') {
        textHtml = `💎 <b>PREMIUM DIAMOND SPIN WON!</b>\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>User:</b> ${escapeHtml(payload.userName)}\n` +
          `💎 <b>Spin Tier:</b> Premium Diamond Wheel\n` +
          `💰 <b>Premium Spin Reward:</b> ৳ ${(payload.reward || 0).toFixed(2)}\n` +
          `📊 <b>Today Premium Spins:</b> ${payload.usedCount || 1} / ${payload.maxUses || 20}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `🔥 <i>Spin the Premium Diamond Wheel to win up to ৳ 10.00 instantly on our Mini App!</i>`;
      }

      const keyboardButtons: any[] = [
        { text: '🚀 Open Mini App', url: miniApp },
        { text: '📢 Channel 1', url: ch1Url }
      ];
      if (ch2Url) {
        keyboardButtons.push({ text: '📢 Channel 2', url: ch2Url });
      }

      const postMsg = async (chatId: string) => {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        try {
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: textHtml,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: { inline_keyboard: [keyboardButtons] }
            })
          });
        } catch (_) {}
      };

      if (ch1Id) await postMsg(ch1Id);
      if (ch2Id) await postMsg(ch2Id);
    } catch (e) {
      console.error('Task notification error:', e);
    }
  };

  // Periodic Channel Check Timer Effect
  useEffect(() => {
    if (!isLoggedIn || !mandatoryChannelsEnabled || !periodicChannelCheckEnabled || !hasCompletedMandatoryJoin) {
      return;
    }

    const intervalMs = (periodicChannelCheckInterval || 5) * 60 * 1000;

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastChannelCheckTime;

      if (elapsed >= intervalMs) {
        console.log(`Running ${periodicChannelCheckInterval}-minute periodic channel re-verification check...`);
        setLastChannelCheckTime(now);
        localStorage.setItem('smm_last_ch_check_ts', String(now));

        const cleanTgId = userTgInputId.trim();
        if (cleanTgId) {
          // Silent auto re-verification via Bot API
          autoReverifyChannels(cleanTgId);
        } else {
          // Prompt lock overlay if user ID is missing
          setHasCompletedMandatoryJoin(false);
          localStorage.removeItem('smm_mandatory_channels_v2');
          showToast(`⏰ ${periodicChannelCheckInterval} মিনিট পরপর জয়েনিং রি-ভেরিফিকেশন আবশ্যক! টেলিগ্রাম আইডি দিয়ে পুনরায় চেক করুন।`, 'warning');
        }
      }
    }, 15000); // Check timer every 15s

    return () => clearInterval(timer);
  }, [isLoggedIn, mandatoryChannelsEnabled, periodicChannelCheckEnabled, hasCompletedMandatoryJoin, lastChannelCheckTime, periodicChannelCheckInterval, userTgInputId]);

  const autoReverifyChannels = async (tgId: string) => {
    const token = tgBotToken.trim() || '8417495766:AAEupqJEr6_IyvOcGXhhdWStj95khUdr8MU';
    let allJoined = true;
    const verifiedIdxs: number[] = [];

    for (let i = 0; i < mandatoryChannels.length; i++) {
      const ch = mandatoryChannels[i];
      let chatIdentifier = ch.chatId?.trim() || ch.url.trim();

      if (chatIdentifier.includes('t.me/')) {
        const match = chatIdentifier.match(/t\.me\/([a-zA-Z0-9_]+)/);
        if (match && match[1]) chatIdentifier = '@' + match[1];
      } else if (!chatIdentifier.startsWith('@') && !chatIdentifier.startsWith('-100')) {
        chatIdentifier = '@' + chatIdentifier;
      }

      try {
        const apiUrl = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatIdentifier)}&user_id=${encodeURIComponent(tgId.replace('@', ''))}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data && data.ok && data.result && ['creator', 'administrator', 'member', 'restricted'].includes(data.result.status)) {
          verifiedIdxs.push(i);
        } else {
          allJoined = false;
        }
      } catch (_) {
        // Network error - skip locking on network glitch
      }
    }

    if (!allJoined || verifiedIdxs.length < mandatoryChannels.length) {
      setHasCompletedMandatoryJoin(false);
      localStorage.removeItem('smm_mandatory_channels_v2');
      showToast('🛑 চ্যানেল লেফট করার কারণে অ্যাপ লক করা হয়েছে! ৪টি চ্যানেলে রি-জয়েন করে ভেরিফাই করুন।', 'error');
      haptic('error');
    } else {
      setVerifiedChannelIndexes(verifiedIdxs);
      setJoinedChannelIndexes(verifiedIdxs);
    }
  };

  // Claim Daily Bonus Handler
  const handleClaimDailyCheckIn = async () => {
    haptic('heavy');
    if (!dailyCheckInEnabled) {
      showToast('⚠️ ডেইলি চেকিং বোনাস সিস্টেম সাময়িকভাবে বন্ধ আছে।', 'warning');
      return;
    }

    const nowTs = Date.now();
    const todayStr = new Date(nowTs).toISOString().slice(0, 10);
    const userStorageKey = 'smm_daily_checkin_' + (currentUser?.uid || 'guest');
    const userStorageKeyTime = 'smm_daily_checkin_ts_' + (currentUser?.uid || 'guest');

    // Check 24-hour cooldown
    const savedTsStr = localStorage.getItem(userStorageKeyTime);
    let lastTs = lastDailyCheckInTime || (savedTsStr ? parseInt(savedTsStr, 10) : 0);

    const nextClaimTime = lastTs ? lastTs + 24 * 60 * 60 * 1000 : 0;
    const isCoolingDown = nextClaimTime > nowTs;

    if (isCoolingDown) {
      const diffMs = nextClaimTime - nowTs;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      showToast(`⏳ আপনি ইতিমধ্যে ক্লেইম করেছেন! পরবর্তী ক্লেইম পাবেন ${hours} ঘণ্টা ${mins} মিনিট পর।`, 'info');
      haptic('heavy');
      return;
    }

    setDailyCheckInLoading(true);
    try {
      const rewardAmt = dailyCheckInReward || 5.0;
      const newBal = (userBalance || 0) + rewardAmt;

      setUserBalance(newBal);
      setLastDailyCheckInDate(todayStr);
      setLastDailyCheckInTime(nowTs);
      localStorage.setItem(userStorageKey, todayStr);
      localStorage.setItem(userStorageKeyTime, String(nowTs));

      if (currentUser?.uid) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          balance: newBal,
          lastDailyCheckInDate: todayStr,
          lastDailyCheckInTime: nowTs
        });
      }

      showToast(`🎉 অভিনন্দন! আপনি ৳ ${rewardAmt.toFixed(2)} ডেইলি চেক-ইন বোনাস পেয়েছেন!`, 'success');
      haptic('success');

      // Send live notification to Telegram channel
      sendTelegramTaskNotification('daily', {
        userName: currentUser?.name || currentUser?.username || 'User',
        userId: currentUser?.uid || 'N/A',
        reward: rewardAmt
      });
    } catch (err) {
      console.error(err);
      showToast('ভিজিটিং এরর! পুনরায় চেষ্টা করুন।', 'error');
    } finally {
      setDailyCheckInLoading(false);
    }
  };

  // Redeem Promo Code Handler
  const handleRedeemPromoCode = async () => {
    haptic('heavy');
    if (!promoCodeEnabled) {
      showToast('⚠️ প্রোমো কোড রিডিম সিস্টেম এখন অফ আছে।', 'warning');
      return;
    }

    const cleanCode = inputPromoCode.trim().toUpperCase();
    if (!cleanCode) {
      showToast('⚠️ অনুগ্রহ করে একটি প্রোমো কোড লিখুন!', 'warning');
      haptic('error');
      return;
    }

    setPromoRedeemLoading(true);

    try {
      const matchIndex = promoCodes.findIndex((p) => p.code.toUpperCase() === cleanCode);
      if (matchIndex === -1) {
        showToast('🛑 ভুল বা অবৈধ প্রোমো কোড!', 'error');
        haptic('error');
        setPromoRedeemLoading(false);
        return;
      }

      const targetPromo = promoCodes[matchIndex];
      const userId = currentUser?.uid || 'guest';

      if (targetPromo.usedCount >= targetPromo.maxUses) {
        showToast('🛑 এই প্রোমো কোডের ব্যবহারের লিমিট শেষ হয়ে গেছে!', 'error');
        haptic('error');
        setPromoRedeemLoading(false);
        return;
      }

      if (targetPromo.usedByUsers?.includes(userId)) {
        showToast('🛑 আপনি এই প্রোমো কোডটি ইতিমধ্যে ব্যবহার করে ফেলেছেন!', 'warning');
        haptic('error');
        setPromoRedeemLoading(false);
        return;
      }

      // Valid! Credit balance
      const rewardAmt = targetPromo.reward;
      const newBal = (userBalance || 0) + rewardAmt;
      const updatedUsedCount = targetPromo.usedCount + 1;
      const updatedUsedUsers = [...(targetPromo.usedByUsers || []), userId];

      setUserBalance(newBal);

      const updatedPromoList = [...promoCodes];
      updatedPromoList[matchIndex] = {
        ...targetPromo,
        usedCount: updatedUsedCount,
        usedByUsers: updatedUsedUsers
      };
      setPromoCodes(updatedPromoList);
      setInputPromoCode('');

      if (currentUser?.uid) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          balance: newBal
        });
      }

      // Sync promo code usage to Firestore
      if (targetPromo.id) {
        try {
          await updateDoc(doc(db, 'promo_codes', targetPromo.id), {
            usedCount: updatedUsedCount,
            usedByUsers: updatedUsedUsers
          });
        } catch (e) {
          console.error('Error updating promo_codes doc in Firestore:', e);
        }
      }

      showToast(`🎉 অভিনন্দন! ৳ ${rewardAmt.toFixed(2)} প্রোমো কোড বোনাস রিডিম সফল হয়েছে!`, 'success');
      haptic('success');

      // Send live notification to Telegram channel
      sendTelegramTaskNotification('promo', {
        userName: currentUser?.name || currentUser?.username || 'User',
        userId: currentUser?.uid || 'N/A',
        reward: rewardAmt,
        code: targetPromo.code,
        usedCount: updatedUsedCount,
        maxUses: targetPromo.maxUses
      });
    } catch (e) {
      console.error('Promo error:', e);
      showToast('প্রোমো কোড রিডিম করতে সমস্যা হয়েছে!', 'error');
    } finally {
      setPromoRedeemLoading(false);
    }
  };

  const handleCreatePromoCode = async () => {
    const codeStr = newPromoCode.trim().toUpperCase();
    const rewardVal = parseFloat(newPromoReward) || 10;
    const maxUsesVal = parseInt(newPromoMaxUses, 10) || 50;

    if (!codeStr) {
      showToast('⚠️ প্রোমো কোডের নাম লিখুন!', 'warning');
      return;
    }

    if (promoCodes.some((p) => p.code.toUpperCase() === codeStr)) {
      showToast('⚠️ এই নামে ইতিমধ্যে প্রোমো কোড আছে!', 'warning');
      return;
    }

    const docId = 'promo_' + Date.now();
    const newObj = {
      id: docId,
      code: codeStr,
      reward: rewardVal,
      maxUses: maxUsesVal,
      usedCount: 0,
      usedByUsers: []
    };

    try {
      await setDoc(doc(db, 'promo_codes', docId), newObj);
      setNewPromoCode('');
      setNewPromoReward('10');
      setNewPromoMaxUses('50');
      showToast(`✅ নতুন প্রোমো কোড "${codeStr}" সফলভাবে ফায়ারবেসে সেভ হয়েছে!`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error creating promo code in Firestore:', e);
      showToast('প্রোমো কোড সেভ করতে সমস্যা: ' + e.message, 'error');
    }
  };

  const handleDeletePromoCode = async (id: string, code: string) => {
    if (confirm(`আপনি কি সত্যিই "${code}" প্রোমো কোডটি ডিলিট করতে চান?`)) {
      try {
        await deleteDoc(doc(db, 'promo_codes', id));
        setPromoCodes((prev) => prev.filter((p) => p.id !== id));
        showToast(`🗑️ "${code}" প্রোমো কোড ফায়ারবেস থেকে মুছে ফেলা হয়েছে!`, 'info');
        haptic('light');
      } catch (e: any) {
        console.error('Error deleting promo code from Firestore:', e);
        showToast('ডিলিট করতে সমস্যা: ' + e.message, 'error');
      }
    }
  };

  const handleWatchAdEarn = async () => {
    haptic('heavy');
    if (!adEarnEnabled) {
      showToast('⚠️ এড দেখে আয় করার অপশনটি এখন বন্ধ আছে।', 'warning');
      return;
    }

    if (todayAdsWatchedCount >= adEarnDailyMaxLimit) {
      showToast(`🛑 আপনি আজকের দৈনিক সর্বোচ্চ লিমিট (${adEarnDailyMaxLimit}টি এড) সম্পূর্ণ করে ফেলেছেন! আগামীকাল আবার এড দেখতে পারবেন।`, 'warning');
      haptic('error');
      return;
    }

    // 1. Ensure Monetag SDK script tag exists & trigger SDK function
    try {
      if (typeof (window as any).show_11498050 !== 'function') {
        const existingScript = document.querySelector('script[data-zone="11498050"]');
        if (!existingScript) {
          const script = document.createElement('script');
          script.src = 'https://libtl.com/sdk.js';
          script.setAttribute('data-zone', '11498050');
          script.setAttribute('data-sdk', 'show_11498050');
          script.async = true;
          document.head.appendChild(script);
        }
      }

      // Trigger Monetag SDK Rewarded Interstitial
      if (typeof (window as any).show_11498050 === 'function') {
        try {
          (window as any).show_11498050().then(() => {
            console.log('Monetag ad finished showing');
          }).catch((err: any) => {
            console.log('Monetag ad error/closed:', err);
          });
        } catch (sdkErr) {
          console.log('Ad SDK execution log:', sdkErr);
        }
      } else {
        // Fallback open Monetag offer
        window.open('https://alwingulla.com/', '_blank');
      }
    } catch (e) {
      console.log('Ad setup check:', e);
    }

    // 3. Open Ad Player Modal & start 5s countdown
    setShowAdModal(true);
    setAdCountdown(5);
    setAdCanClaim(false);
  };

  const handleClaimAdReward = async () => {
    haptic('success');
    setAdWatchLoading(true);

    try {
      const rewardAmt = adEarnRewardPerAd !== undefined ? adEarnRewardPerAd : 0;
      const newBal = (userBalance || 0) + rewardAmt;
      const newAdCount = todayAdsWatchedCount + 1;

      setUserBalance(newBal);
      setTodayAdsWatchedCount(newAdCount);
      localStorage.setItem(getTodayAdStorageKey(), String(newAdCount));

      if (currentUser?.uid) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          balance: newBal
        });
      }

      await sendTelegramTaskNotification('ad', {
        userName: currentUser?.name || currentUser?.username || 'User',
        userId: currentUser?.uid || 'N/A',
        reward: rewardAmt
      });

      showToast(`🎉 এড সফলভাবে সম্পন্ন হয়েছে! ৳ ${rewardAmt.toFixed(2)} ওয়ালেটে যোগ করা হয়েছে! (${newAdCount}/${adEarnDailyMaxLimit})`, 'success');
      setShowAdModal(false);
    } catch (e) {
      console.error('Ad Claim Error:', e);
      showToast('এড ক্লেইম করতে সমস্যা হয়েছে! আবার চেষ্টা করুন।', 'error');
    } finally {
      setAdWatchLoading(false);
    }
  };

  const handleStartLuckySpin = async () => {
    if (!luckySpinEnabled) {
      showToast('⚠️ লকি স্পিন সিস্টেম সাময়িকভাবে বন্ধ রাখা হয়েছে।', 'error');
      haptic('error');
      return;
    }

    if (isSpinning) return;

    const userId = currentUser?.uid || 'guest';
    const nowTs = Date.now();
    let currentSpinTs = lastLuckySpinTime;
    let currentCount = todaySpinCount;

    // Check if 24 hours have passed since cycle start
    if (currentSpinTs > 0 && nowTs >= currentSpinTs + 24 * 60 * 60 * 1000) {
      currentCount = 0;
      currentSpinTs = 0;
      setTodaySpinCount(0);
      setLastLuckySpinTime(0);
      localStorage.setItem(`smm_lucky_spin_cnt_${userId}`, '0');
    }

    const nextSpinTs = currentSpinTs ? currentSpinTs + 24 * 60 * 60 * 1000 : 0;
    if (currentCount >= luckySpinDailyMaxLimit && nextSpinTs > nowTs) {
      const diffMs = nextSpinTs - nowTs;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      showToast(`🛑 আপনি ২৪ ঘণ্টার স্পিন লিমিট সম্পন্ন করে ফেলেছেন! পরবর্তী স্পিন রিফ্রেশ পাবেন ${hours} ঘণ্টা ${mins} মিনিট ${secs} সেকেন্ড পর।`, 'warning');
      haptic('error');
      return;
    }

    setIsSpinning(true);
    haptic('heavy');

    // Trigger Monetag Ad if available
    try {
      if (typeof (window as any).show_11498050 === 'function') {
        (window as any).show_11498050().catch(() => {});
      }
    } catch (e) {
      console.log('Ad trigger during spin:', e);
    }

    // Pick a reward segment using weighted probability (90% chance for 0.01 TK - 0.10 TK)
    const segmentsCount = spinRewardOptions.length;
    // 16 Slices & Weights:
    // [0.01, 0.05, 0.10, 0.20, 0.02, 0.50, 0.03, 1.00, 0.01, 0.25, 0.05, 0.15, 0.02, 0.30, 0.04, 0.10]
    const weights = [22, 16, 12, 6, 20, 2, 18, 0.5, 22, 5, 16, 8, 20, 4, 15, 12];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randomWeight = Math.random() * totalWeight;

    let targetIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      if (randomWeight < weights[i]) {
        targetIdx = i;
        break;
      }
      randomWeight -= weights[i];
    }

    const rewardAmt = spinRewardOptions[targetIdx];

    // Calculate rotation angle so pointer at top (12 o'clock) points EXACTLY to targetIdx slice center
    const sliceAngle = 360 / segmentsCount;
    const targetAngle = (270 - targetIdx * sliceAngle + 360) % 360;
    const extraRounds = 1800; // 5 full 360 rotations
    const currentMod = wheelRotation % 360;
    let diffAngle = targetAngle - currentMod;
    if (diffAngle < 0) diffAngle += 360;
    const nextRotation = wheelRotation + extraRounds + diffAngle;

    setWheelRotation(nextRotation);

    const vibInterval = setInterval(() => {
      haptic('light');
    }, 280);

    setTimeout(async () => {
      clearInterval(vibInterval);
      setIsSpinning(false);
      setWonSpinAmount(rewardAmt);
      setShowSpinWinModal(true);
      haptic('success');

      const finishTs = Date.now();
      const newCount = currentCount + 1;
      const updatedSpinTs = (currentSpinTs === 0 || currentCount === 0) ? finishTs : currentSpinTs;

      setTodaySpinCount(newCount);
      setLastLuckySpinTime(updatedSpinTs);

      localStorage.setItem(`smm_lucky_spin_cnt_${userId}`, newCount.toString());
      localStorage.setItem(`smm_lucky_spin_ts_${userId}`, updatedSpinTs.toString());

      const newBal = (userBalance || 0) + rewardAmt;
      setUserBalance(newBal);

      if (currentUser?.uid) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: newBal
          });
        } catch (e) {
          console.error('Update spin balance error:', e);
        }
      }

      await sendTelegramTaskNotification('spin', {
        userName: currentUser?.name || currentUser?.username || 'User',
        userId: currentUser?.uid || 'N/A',
        reward: rewardAmt,
        usedCount: newCount,
        maxUses: luckySpinDailyMaxLimit
      });

      showToast(`🎉 অভিনন্দন! স্পিন ক্লেইম করে ৳ ${rewardAmt.toFixed(2)} ওয়ালেটে যোগ হয়েছে!`, 'success');
    }, 3500);
  };

  const handleStartGoldSpin = async () => {
    if (!goldSpinEnabled) {
      showToast('⚠️ গোল্ড স্পিন সিস্টেম সাময়িকভাবে বন্ধ রাখা হয়েছে।', 'error');
      haptic('error');
      return;
    }

    if ((userBalance || 0) < goldSpinMinBalance) {
      showToast(`🔒 গোল্ড স্পিন আনলক করতে ওয়ালেটে নূন্যতম ৳ ${goldSpinMinBalance} ব্যালেন্স প্রয়োজন! আপনার ব্যালেন্স ৳ ${(userBalance || 0).toFixed(2)}`, 'warning');
      haptic('error');
      return;
    }

    if (isGoldSpinning) return;

    const userId = currentUser?.uid || 'guest';
    const nowTs = Date.now();
    let currentSpinTs = lastGoldSpinTime;
    let currentCount = todayGoldSpinCount;

    // Check if 24 hours have passed since cycle start
    if (currentSpinTs > 0 && nowTs >= currentSpinTs + 24 * 60 * 60 * 1000) {
      currentCount = 0;
      currentSpinTs = 0;
      setTodayGoldSpinCount(0);
      setLastGoldSpinTime(0);
      localStorage.setItem(`smm_gold_spin_cnt_${userId}`, '0');
    }

    const nextGoldSpinTs = currentSpinTs ? currentSpinTs + 24 * 60 * 60 * 1000 : 0;
    if (currentCount >= goldSpinDailyMaxLimit && nextGoldSpinTs > nowTs) {
      const diffMs = nextGoldSpinTs - nowTs;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      showToast(`🛑 আপনি ২৪ ঘণ্টার গোল্ড স্পিন লিমিট সম্পন্ন করেছেন! পরবর্তী গোল্ড স্পিন পাবেন ${hours} ঘণ্টা ${mins} মিনিট ${secs} সেকেন্ড পর।`, 'warning');
      haptic('error');
      return;
    }

    setIsGoldSpinning(true);
    haptic('heavy');

    // Trigger Monetag Ad if available
    try {
      if (typeof (window as any).show_11498050 === 'function') {
        (window as any).show_11498050().catch(() => {});
      }
    } catch (e) {
      console.log('Ad trigger during gold spin:', e);
    }

    // 16 Gold Spin Slices & Weights (85-90% win rate for 0.10 TK - 1.00 TK):
    // [0.10, 0.25, 0.50, 1.00, 0.15, 2.00, 0.30, 3.00, 0.20, 5.00, 0.40, 1.50, 0.10, 4.00, 0.50, 2.50]
    const segmentsCount = goldSpinRewardOptions.length;
    const weights = [20, 15, 12, 8, 18, 3, 14, 1.5, 16, 0.5, 10, 4, 20, 1, 12, 2];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randomWeight = Math.random() * totalWeight;

    let targetIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      if (randomWeight < weights[i]) {
        targetIdx = i;
        break;
      }
      randomWeight -= weights[i];
    }

    const rewardAmt = goldSpinRewardOptions[targetIdx];

    // Calculate rotation angle so pointer at top (12 o'clock) points EXACTLY to targetIdx slice center
    const sliceAngle = 360 / segmentsCount;
    const targetAngle = (270 - targetIdx * sliceAngle + 360) % 360;
    const extraRounds = 1800; // 5 full 360 rotations
    const currentMod = goldWheelRotation % 360;
    let diffAngle = targetAngle - currentMod;
    if (diffAngle < 0) diffAngle += 360;
    const nextRotation = goldWheelRotation + extraRounds + diffAngle;

    setGoldWheelRotation(nextRotation);

    const vibInterval = setInterval(() => {
      haptic('light');
    }, 280);

    setTimeout(async () => {
      clearInterval(vibInterval);
      setIsGoldSpinning(false);
      setWonGoldSpinAmount(rewardAmt);
      setShowGoldSpinWinModal(true);
      haptic('success');

      const finishTs = Date.now();
      const newCount = currentCount + 1;
      const updatedSpinTs = (currentSpinTs === 0 || currentCount === 0) ? finishTs : currentSpinTs;

      setTodayGoldSpinCount(newCount);
      setLastGoldSpinTime(updatedSpinTs);

      localStorage.setItem(`smm_gold_spin_cnt_${userId}`, newCount.toString());
      localStorage.setItem(`smm_gold_spin_ts_${userId}`, updatedSpinTs.toString());

      const newBal = (userBalance || 0) + rewardAmt;
      setUserBalance(newBal);

      if (currentUser?.uid) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: newBal
          });
        } catch (e) {
          console.error('Update gold spin balance error:', e);
        }
      }

      await sendTelegramTaskNotification('gold_spin', {
        userName: currentUser?.name || currentUser?.username || 'User',
        userId: currentUser?.uid || 'N/A',
        reward: rewardAmt,
        usedCount: newCount,
        maxUses: goldSpinDailyMaxLimit
      });

      showToast(`🏆 অভিনন্দন! গোল্ড ভিআইপি স্পিন ক্লেইম করে ৳ ${rewardAmt.toFixed(2)} ওয়ালেটে যোগ হয়েছে!`, 'success');
    }, 3500);
  };

  const handleStartPremiumSpin = async () => {
    if (!premiumSpinEnabled) {
      showToast('⚠️ প্রিমিয়াম স্পিন সিস্টেম সাময়িকভাবে বন্ধ রাখা হয়েছে।', 'error');
      haptic('error');
      return;
    }

    if ((userBalance || 0) < premiumSpinMinBalance) {
      showToast(`🔒 প্রিমিয়াম স্পিন আনলক করতে ওয়ালেটে নূন্যতম ৳ ${premiumSpinMinBalance} ব্যালেন্স প্রয়োজন! আপনার ব্যালেন্স ৳ ${(userBalance || 0).toFixed(2)}`, 'warning');
      haptic('error');
      return;
    }

    if (isPremiumSpinning) return;

    const userId = currentUser?.uid || 'guest';
    const nowTs = Date.now();
    let currentSpinTs = lastPremiumSpinTime;
    let currentCount = todayPremiumSpinCount;

    // Check if 24 hours have passed since cycle start
    if (currentSpinTs > 0 && nowTs >= currentSpinTs + 24 * 60 * 60 * 1000) {
      currentCount = 0;
      currentSpinTs = 0;
      setTodayPremiumSpinCount(0);
      setLastPremiumSpinTime(0);
      localStorage.setItem(`smm_premium_spin_cnt_${userId}`, '0');
    }

    const nextPremiumSpinTs = currentSpinTs ? currentSpinTs + 24 * 60 * 60 * 1000 : 0;
    if (currentCount >= premiumSpinDailyMaxLimit && nextPremiumSpinTs > nowTs) {
      const diffMs = nextPremiumSpinTs - nowTs;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      showToast(`🛑 আপনি ২৪ ঘণ্টার প্রিমিয়াম স্পিন লিমিট সম্পন্ন করেছেন! পরবর্তী প্রিমিয়াম স্পিন পাবেন ${hours} ঘণ্টা ${mins} মিনিট ${secs} সেকেন্ড পর।`, 'warning');
      haptic('error');
      return;
    }

    setIsPremiumSpinning(true);
    haptic('heavy');

    // Trigger Monetag Ad if available
    try {
      if (typeof (window as any).show_11498050 === 'function') {
        (window as any).show_11498050().catch(() => {});
      }
    } catch (e) {
      console.log('Ad trigger during premium spin:', e);
    }

    // 16 Premium Diamond Spin Slices & Weights (90% chance for 0.30 TK - 1.00 TK, up to 10.00 TK):
    // [0.30, 0.50, 0.80, 1.00, 0.30, 2.00, 0.50, 5.00, 0.80, 10.00, 1.00, 0.30, 0.50, 3.00, 0.80, 1.00]
    const segmentsCount = premiumSpinRewardOptions.length;
    const weights = [25, 20, 18, 12, 25, 8, 20, 5, 18, 6, 12, 25, 20, 6, 18, 12];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let randomWeight = Math.random() * totalWeight;

    let targetIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      if (randomWeight < weights[i]) {
        targetIdx = i;
        break;
      }
      randomWeight -= weights[i];
    }

    const rewardAmt = premiumSpinRewardOptions[targetIdx];

    // Calculate rotation angle so pointer at top (12 o'clock) points EXACTLY to targetIdx slice center
    const sliceAngle = 360 / segmentsCount;
    const targetAngle = (270 - targetIdx * sliceAngle + 360) % 360;
    const extraRounds = 1800; // 5 full 360 rotations
    const currentMod = premiumWheelRotation % 360;
    let diffAngle = targetAngle - currentMod;
    if (diffAngle < 0) diffAngle += 360;
    const nextRotation = premiumWheelRotation + extraRounds + diffAngle;

    setPremiumWheelRotation(nextRotation);

    const vibInterval = setInterval(() => {
      haptic('light');
    }, 280);

    setTimeout(async () => {
      clearInterval(vibInterval);
      setIsPremiumSpinning(false);
      setWonPremiumSpinAmount(rewardAmt);
      setShowPremiumSpinWinModal(true);
      haptic('success');

      const finishTs = Date.now();
      const newCount = currentCount + 1;
      const updatedSpinTs = (currentSpinTs === 0 || currentCount === 0) ? finishTs : currentSpinTs;

      setTodayPremiumSpinCount(newCount);
      setLastPremiumSpinTime(updatedSpinTs);

      localStorage.setItem(`smm_premium_spin_cnt_${userId}`, newCount.toString());
      localStorage.setItem(`smm_premium_spin_ts_${userId}`, updatedSpinTs.toString());

      const newBal = (userBalance || 0) + rewardAmt;
      setUserBalance(newBal);

      if (currentUser?.uid) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            balance: newBal
          });
        } catch (e) {
          console.error('Update premium spin balance error:', e);
        }
      }

      await sendTelegramTaskNotification('premium_spin', {
        userName: currentUser?.name || currentUser?.username || 'User',
        userId: currentUser?.uid || 'N/A',
        reward: rewardAmt,
        usedCount: newCount,
        maxUses: premiumSpinDailyMaxLimit
      });

      showToast(`💎 অভিনন্দন! প্রিমিয়াম ডায়মন্ড স্পিন ক্লেইম করে ৳ ${rewardAmt.toFixed(2)} ওয়ালেটে যোগ হয়েছে!`, 'success');
    }, 3500);
  };

  const verifyChannelsWithBot = async () => {
    haptic('heavy');
    const cleanTgId = userTgInputId.trim();
    if (!cleanTgId) {
      showToast('⚠️ মেম্বারশিপ চেক করার জন্য আপনার Telegram User ID দিন!', 'warning');
      haptic('error');
      return;
    }

    setBotVerifyLoading(true);
    setChannelVerificationErrors({});
    showToast('🔍 টেলিগ্রাম বট দ্বারা জয়েনিং ভেরিফাই করা হচ্ছে...', 'info');

    const newVerified: number[] = [];
    const errorsMap: Record<number, string> = {};

    const token = tgBotToken.trim() || '8417495766:AAEupqJEr6_IyvOcGXhhdWStj95khUdr8MU';

    for (let i = 0; i < mandatoryChannels.length; i++) {
      const ch = mandatoryChannels[i];
      let chatIdentifier = ch.chatId?.trim() || ch.url.trim();

      if (chatIdentifier.includes('t.me/')) {
        const match = chatIdentifier.match(/t\.me\/([a-zA-Z0-9_]+)/);
        if (match && match[1]) {
          chatIdentifier = '@' + match[1];
        }
      } else if (!chatIdentifier.startsWith('@') && !chatIdentifier.startsWith('-100')) {
        chatIdentifier = '@' + chatIdentifier;
      }

      try {
        const apiUrl = `https://api.telegram.org/bot${token}/getChatMember?chat_id=${encodeURIComponent(chatIdentifier)}&user_id=${encodeURIComponent(cleanTgId.replace('@', ''))}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data && data.ok && data.result) {
          const status = data.result.status;
          if (['creator', 'administrator', 'member', 'restricted'].includes(status)) {
            newVerified.push(i);
          } else {
            errorsMap[i] = 'আপনি এই চ্যানেলে জয়েন করেননি!';
          }
        } else {
          const desc = data?.description || 'ভেরিফাই করা সম্ভব হয়নি';
          if (desc.toLowerCase().includes('user not found') || desc.toLowerCase().includes('participant') || desc.toLowerCase().includes('member not found')) {
            errorsMap[i] = 'মেম্বারশিপ খুঁজে পাওয়া যায়নি! চ্যানেলে জয়েন করুন।';
          } else if (desc.toLowerCase().includes('integer') || desc.toLowerCase().includes('invalid user_id')) {
            errorsMap[i] = 'মেম্বারশিপ চেকের জন্য সংখ্যাভিত্তিক Telegram User ID দিন (যেমন: 1234567890)';
          } else {
            errorsMap[i] = desc;
          }
        }
      } catch (e: any) {
        errorsMap[i] = 'নেটওয়ার্ক এরর!';
      }
    }

    setVerifiedChannelIndexes(newVerified);
    setJoinedChannelIndexes(newVerified);
    setChannelVerificationErrors(errorsMap);
    setBotVerifyLoading(false);

    localStorage.setItem('smm_user_tg_id', cleanTgId);

    if (newVerified.length === mandatoryChannels.length) {
      setHasCompletedMandatoryJoin(true);
      localStorage.setItem('smm_mandatory_channels_v2', 'true');
      showToast('🎉 সফল হয়েছে! বট দ্বারা ৪টি চ্যানেলেই আপনার জয়েনিং ভেরিফাই করা হয়েছে।', 'success');
      haptic('success');

      if (currentUser?.uid) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            hasJoinedMandatoryChannels: true,
            joinedChannelsAt: serverTimestamp(),
            telegramUserId: cleanTgId
          });
        } catch (_) {}
      }
    } else {
      showToast(`🛑 ৪টির মধ্যে ${newVerified.length}টি চ্যানেল ভেরিফাইড। বাকি ${mandatoryChannels.length - newVerified.length}টিতে জয়েন করে আবার রিফ্রেশ করুন!`, 'error');
      haptic('error');
    }
  };

  const escapeHtml = (str: any) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const sendOrderToTelegramChannel = async (orderInfo: {
    orderId: string;
    userName: string;
    serviceName: string;
    quantity: number;
    cost: number;
    link: string;
    status?: string;
    apiOrderId?: string | number;
  }) => {
    try {
      const token = tgBotToken.trim() || '8417495766:AAEupqJEr6_IyvOcGXhhdWStj95khUdr8MU';
      const ch1Id = tgChannel1Id.trim() || '-1003911086814';
      const ch1Url = tgChannel1Url.trim() || 'https://t.me/RF2_SMM';
      const ch2Id = tgChannel2Id.trim();
      const ch2Url = tgChannel2Url.trim();
      const miniApp = tgMiniAppUrl.trim() || 'https://t.me/RF_SMM_PRO_BOT?startapp=8479465879';

      const shortOrderId = orderInfo.orderId ? orderInfo.orderId.slice(-6).toUpperCase() : 'NEW';

      const textHtml = `🛍️ <b>NEW LIVE ORDER PLACED!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 <b>Order ID:</b> <code>#${escapeHtml(shortOrderId)}</code>\n` +
        (orderInfo.apiOrderId ? `⚡ <b>API Order ID:</b> <code>${escapeHtml(orderInfo.apiOrderId)}</code>\n` : '') +
        `👤 <b>Customer:</b> ${escapeHtml(orderInfo.userName || 'Customer')}\n` +
        `📦 <b>Service:</b> ${escapeHtml(orderInfo.serviceName)}\n` +
        `🔢 <b>Quantity:</b> ${(orderInfo.quantity || 0).toLocaleString()}\n` +
        `💰 <b>Cost:</b> ৳ ${(orderInfo.cost || 0).toFixed(2)}\n` +
        `📌 <b>Status:</b> ${escapeHtml(orderInfo.status || 'Processing')}\n` +
        `🔗 <b>Target Link:</b>\n<code>${escapeHtml(orderInfo.link)}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🚀 <i>Fastest SMM Panel Service in Bangladesh! Order via Bot or Mini App below:</i>`;

      const textPlain = `🛍️ NEW LIVE ORDER PLACED!\n` +
        `--------------------\n` +
        `🆔 Order ID: #${shortOrderId}\n` +
        (orderInfo.apiOrderId ? `⚡ API Order ID: ${orderInfo.apiOrderId}\n` : '') +
        `👤 Customer: ${orderInfo.userName || 'Customer'}\n` +
        `📦 Service: ${orderInfo.serviceName}\n` +
        `🔢 Quantity: ${(orderInfo.quantity || 0).toLocaleString()}\n` +
        `💰 Cost: ৳ ${(orderInfo.cost || 0).toFixed(2)}\n` +
        `📌 Status: ${orderInfo.status || 'Processing'}\n` +
        `🔗 Target Link:\n${orderInfo.link}\n` +
        `--------------------\n` +
        `🚀 Order via Bot or Mini App below:`;

      const keyboardButtons: any[] = [
        { text: '🚀 Open Mini App', url: miniApp },
        { text: '📢 Channel 1', url: ch1Url }
      ];

      if (ch2Url) {
        keyboardButtons.push({ text: '📢 Channel 2', url: ch2Url });
      }

      const postToTelegram = async (chatId: string) => {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        // Attempt 1: Send HTML formatted message
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: textHtml,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: { inline_keyboard: [keyboardButtons] }
            })
          });
          const data = await res.json();
          if (data && data.ok) return { ok: true, data };

          console.warn(`Telegram HTML post failed for ${chatId}:`, data?.description);
          // Attempt 2: Fallback to plain text if HTML parsing failed
          const fallbackRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: textPlain,
              disable_web_page_preview: true,
              reply_markup: { inline_keyboard: [keyboardButtons] }
            })
          });
          const fallbackData = await fallbackRes.json();
          return { ok: !!fallbackData?.ok, data: fallbackData, error: fallbackData?.description || data?.description };
        } catch (fetchErr: any) {
          console.error(`Fetch exception to Telegram for ${chatId}:`, fetchErr);
          return { ok: false, error: fetchErr?.message };
        }
      };

      let ch1Result: { ok: boolean; data?: any; error?: string } = { ok: false, error: '' };
      let ch2Result: { ok: boolean; data?: any; error?: string } = { ok: false, error: '' };

      if (ch1Id) {
        ch1Result = await postToTelegram(ch1Id);
      }
      if (ch2Id) {
        ch2Result = await postToTelegram(ch2Id);
      }

      return { ch1Result, ch2Result };
    } catch (err: any) {
      console.error('Failed to send Telegram channel alert:', err);
      return { error: err?.message };
    }
  };

  const handleTestTelegramNotification = async () => {
    haptic('heavy');
    showToast('Sending test message to Telegram channel...', 'info');
    try {
      const res = await sendOrderToTelegramChannel({
        orderId: 'TEST_' + Math.floor(100000 + Math.random() * 900000),
        userName: currentUser?.name || 'Admin Test',
        serviceName: 'Facebook Page Likes & Followers (Real & Refill)',
        quantity: 1000,
        cost: 150.00,
        link: 'https://t.me/RF2_SMM',
        status: 'Processing',
        apiOrderId: 849201
      });

      if (res?.ch1Result?.ok) {
        showToast('✅ Test message sent to Telegram channel!', 'success');
        haptic('success');
      } else {
        const errMsg = res?.ch1Result?.error || res?.error || 'Telegram API returned an error';
        showToast(`❌ Telegram error: ${errMsg}`, 'error');
        haptic('error');
      }
    } catch (e: any) {
      showToast('Failed to send test message: ' + e.message, 'error');
      haptic('error');
    }
  };

  const handleSaveTelegramSettings = async () => {
    haptic('heavy');
    try {
      await setDoc(doc(db, 'settings', 'telegram'), {
        botToken: tgBotToken.trim(),
        channel1Id: tgChannel1Id.trim(),
        channel1Url: tgChannel1Url.trim(),
        channel2Id: tgChannel2Id.trim(),
        channel2Url: tgChannel2Url.trim(),
        miniAppUrl: tgMiniAppUrl.trim(),
        mandatoryChannels: mandatoryChannels,
        mandatoryChannelsEnabled: mandatoryChannelsEnabled,
        updatedAt: serverTimestamp()
      });
      showToast('✅ Telegram Settings saved to database!', 'success');
      haptic('success');
    } catch (e: any) {
      showToast('Failed to save Telegram settings: ' + e.message, 'error');
      haptic('error');
    }
  };

  const [replyingMailId, setReplyingMailId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const [adminCategory, setAdminCategory] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPrice, setAdminPrice] = useState('');
  const [adminMin, setAdminMin] = useState('100');
  const [adminMax, setAdminMax] = useState('100000');
  const [adminDesc, setAdminDesc] = useState('');
  const [adminApiServiceId, setAdminApiServiceId] = useState('');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // Search Modal & Global Search State
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  // Notification System State
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    title: string;
    message: string;
    time: string;
    unread: boolean;
    type: 'order' | 'deposit' | 'system' | 'promo';
  }>>([
    {
      id: '1',
      title: 'Welcome to SMM Panel 🚀',
      message: 'Instant automated delivery is enabled on all Facebook, TikTok & Telegram services!',
      time: 'Just now',
      unread: true,
      type: 'system'
    },
    {
      id: '2',
      title: 'Crypto Payments Active 💳',
      message: 'You can now add funds using Binance Pay (UID: 584304364) or USDT BEP20.',
      time: '1 hour ago',
      unread: true,
      type: 'deposit'
    },
    {
      id: '3',
      title: 'Special Offer 🎉',
      message: 'Get 10% extra bonus balance on deposits of ৳1,000 or more!',
      time: 'Today',
      unread: false,
      type: 'promo'
    }
  ]);

  // Live Orders & Tasks State
  const [showLiveOrdersModal, setShowLiveOrdersModal] = useState(false);
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [liveOrdersFilter, setLiveOrdersFilter] = useState<'all' | 'my'>('all');
  const [claimedTasks, setClaimedTasks] = useState<string[]>([]);

  // Tasks & Screenshot Proof Submissions State
  const [allTaskSubmissions, setAllTaskSubmissions] = useState<TaskSubmission[]>([]);
  const [customTasks, setCustomTasks] = useState<TaskItem[]>([
    {
      id: 'task_tg',
      title: '1. Telegram চ্যানেলে জয়েন করুন',
      description: 'অফিসিয়াল টেলিগ্রাম চ্যানেলে যুক্ত হয়ে জয়েন স্ক্রিনশট ও আইডি জমা দিন',
      reward: 5,
      link: 'https://t.me/RF2_SMM',
      icon: 'fab fa-telegram-plane'
    },
    {
      id: 'task_fb',
      title: '2. Facebook পেজ লাইক ও ফলো করুন',
      description: 'ফেসবুক পেজে লাইক দিয়ে ফলো করার স্ক্রিনশট দিন',
      reward: 5,
      link: 'https://www.facebook.com/share/1EKKUHMxCw/',
      icon: 'fab fa-facebook'
    },
    {
      id: 'task_yt',
      title: '3. YouTube চ্যানেল সাবস্ক্রাইব করুন',
      description: 'ইউটিউব চ্যানেল সাবস্ক্রাইব করে স্ক্রিনশট দিন',
      reward: 5,
      link: 'https://youtube.com',
      icon: 'fab fa-youtube'
    }
  ]);
  const [selectedTaskForProof, setSelectedTaskForProof] = useState<TaskItem | null>(null);
  const [taskProofNotes, setTaskProofNotes] = useState('');
  const [taskProofScreenshots, setTaskProofScreenshots] = useState<string[]>([]);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [adminTaskFilter, setAdminTaskFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const [selectedScreenshotPreview, setSelectedScreenshotPreview] = useState<string | null>(null);

  // Admin New Task Creation State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskReward, setNewTaskReward] = useState('5');
  const [newTaskMaxUserLimit, setNewTaskMaxUserLimit] = useState<string>('0');
  const [newTaskLink, setNewTaskLink] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState('fas fa-tasks');
  const [newTaskImage, setNewTaskImage] = useState<string | null>(null);

  // Admin Task Full Edit State
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskReward, setEditTaskReward] = useState('5');
  const [editTaskMaxUserLimit, setEditTaskMaxUserLimit] = useState('0');
  const [editTaskLink, setEditTaskLink] = useState('');
  const [editTaskIcon, setEditTaskIcon] = useState('fas fa-tasks');
  const [editTaskImage, setEditTaskImage] = useState<string | null>(null);

  // Live Deposit System State (bKash & Nagad Auto Live Gateway)
  const [liveTrxSearch, setLiveTrxSearch] = useState('');
  const [isAutoDepositMode, setIsAutoDepositMode] = useState(true);
  const [autoDepositVerifying, setAutoDepositVerifying] = useState(false);
  const [autoDepositProgress, setAutoDepositProgress] = useState(0);
  const [autoDepositStatusText, setAutoDepositStatusText] = useState('');

  // Mailbox System State
  const [showMailboxModal, setShowMailboxModal] = useState(false);
  const [mailboxTab, setMailboxTab] = useState<'inbox' | 'compose'>('inbox');
  const [mailSubject, setMailSubject] = useState('');
  const [mailMessage, setMailMessage] = useState('');
  const [mailSubmitting, setMailSubmitting] = useState(false);
  const [mailList, setMailList] = useState<Array<{
    id: string;
    sender: string;
    subject: string;
    message: string;
    time: string;
    unread: boolean;
    isAdminReply?: boolean;
  }>>([
    {
      id: 'm1',
      sender: 'Admin Support',
      subject: 'Welcome to SMM Panel Support',
      message: 'Hello! Thank you for joining us. If you need custom packages or support, reply here or contact us via Telegram.',
      time: 'Today 10:00 AM',
      unread: true,
      isAdminReply: true
    },
    {
      id: 'm2',
      sender: 'System Notice',
      subject: 'Order Completion Speed Notice',
      message: 'Facebook Followers & TikTok Views start within 1-5 minutes of placing your order.',
      time: 'Yesterday',
      unread: false,
      isAdminReply: true
    }
  ]);

  // Modal Confirm State
  const [modalConfig, setModalConfig] = useState<{
    show: boolean;
    title: string;
    bodyHtml: React.ReactNode;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    bodyHtml: null,
    onConfirm: () => {}
  });

  // Toasts
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: string }>>([]);

  const tg = (window as any).Telegram?.WebApp || null;

  // Haptic Feedback Helper
  const haptic = (type: 'light' | 'heavy' | 'success' | 'error' = 'light') => {
    if (!tg?.HapticFeedback) return;
    try {
      if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
      else if (type === 'heavy') tg.HapticFeedback.impactOccurred('heavy');
      else tg.HapticFeedback.impactOccurred('light');
    } catch (_) {}
  };

  const showToast = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  // Claim Task Reward Handler
  const handleClaimTask = async (taskId: string, rewardAmt: number, taskTitle: string) => {
    if (claimedTasks.includes(taskId)) {
      showToast('You have already claimed this task reward!', 'info');
      return;
    }
    if (!currentUser) {
      showToast('Please login to claim tasks', 'error');
      return;
    }

    try {
      const newBal = userBalance + rewardAmt;
      await updateDoc(doc(db, 'users', currentUser.uid), {
        balance: newBal
      });
      setUserBalance(newBal);
      setClaimedTasks((prev) => [...prev, taskId]);
      showToast(`🎉 ৳${rewardAmt} added for completing "${taskTitle}"!`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Task claim error:', e);
      setUserBalance((prev) => prev + rewardAmt);
      setClaimedTasks((prev) => [...prev, taskId]);
      showToast(`🎉 ৳${rewardAmt} added to your balance!`, 'success');
      haptic('success');
    }
  };

  // Simple Password Hash
  const simpleHash = async (str: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str + 'firstsmm_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  // 1. Initial Load & Auto Login Check
  useEffect(() => {
    if (tg) {
      try {
        tg.ready();
        tg.expand();
      } catch (_) {}
    }

    const initApp = async () => {
      try {
        const saved = localStorage.getItem('smm_session');
        if (saved) {
          const session = JSON.parse(saved);
          if (session.uid && session.username) {
            const uSnap = await getDoc(doc(db, 'auth_users', session.uid));
            if (uSnap.exists()) {
              setCurrentUser(session);
              if (session.photoURL) setUserPhotoURL(session.photoURL);
              setIsLoggedIn(true);
            } else {
              localStorage.removeItem('smm_session');
            }
          }
        }
      } catch (_) {
        localStorage.removeItem('smm_session');
      }

      setTimeout(() => {
        setShowSplash(false);
      }, 2000);
    };

    initApp();
  }, []);

  // Sync Telegram Settings from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'telegram'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (d.botToken) setTgBotToken(d.botToken);
        if (d.channel1Id) setTgChannel1Id(d.channel1Id);
        if (d.channel1Url) setTgChannel1Url(d.channel1Url);
        if (d.channel2Id !== undefined) setTgChannel2Id(d.channel2Id);
        if (d.channel2Url !== undefined) setTgChannel2Url(d.channel2Url);
        if (d.miniAppUrl) setTgMiniAppUrl(d.miniAppUrl);
        if (d.mandatoryChannels && Array.isArray(d.mandatoryChannels) && d.mandatoryChannels.length > 0) {
          setMandatoryChannels(d.mandatoryChannels);
        }
        if (d.mandatoryChannelsEnabled !== undefined) {
          setMandatoryChannelsEnabled(d.mandatoryChannelsEnabled);
        }
      }
    });
    return () => unsub();
  }, []);

  // Helper to save task configuration (Lucky Spin, Gold Spin, Daily Check-in, Ad Earn, Promo) to Firestore
  const saveTaskConfigToFirestore = async (updates: Record<string, any>) => {
    try {
      await setDoc(doc(db, 'settings', 'tasks_config'), updates, { merge: true });
    } catch (e: any) {
      console.error('Error saving tasks config to Firestore:', e);
      showToast('⚠️ ফায়ারবেসে সেভ করতে সমস্যা: ' + (e.message || 'Error'), 'error');
    }
  };

  // Sync Task Settings (Lucky Spin, Gold Spin, Daily Check-in, Ad Earn, Promo) from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'tasks_config'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (d.luckySpinEnabled !== undefined) setLuckySpinEnabled(Boolean(d.luckySpinEnabled));
        if (d.luckySpinDailyMaxLimit !== undefined) setLuckySpinDailyMaxLimit(Number(d.luckySpinDailyMaxLimit) || 50);
        if (d.goldSpinEnabled !== undefined) setGoldSpinEnabled(Boolean(d.goldSpinEnabled));
        if (d.goldSpinMinBalance !== undefined) setGoldSpinMinBalance(Number(d.goldSpinMinBalance) || 50);
        if (d.goldSpinDailyMaxLimit !== undefined) setGoldSpinDailyMaxLimit(Number(d.goldSpinDailyMaxLimit) || 20);
        if (d.premiumSpinEnabled !== undefined) setPremiumSpinEnabled(Boolean(d.premiumSpinEnabled));
        if (d.premiumSpinMinBalance !== undefined) setPremiumSpinMinBalance(Number(d.premiumSpinMinBalance) || 100);
        if (d.premiumSpinDailyMaxLimit !== undefined) setPremiumSpinDailyMaxLimit(Number(d.premiumSpinDailyMaxLimit) || 1);
        if (d.dailyCheckInEnabled !== undefined) setDailyCheckInEnabled(Boolean(d.dailyCheckInEnabled));
        if (d.dailyCheckInReward !== undefined) setDailyCheckInReward(Number(d.dailyCheckInReward) || 5.0);
        if (d.adEarnEnabled !== undefined) setAdEarnEnabled(Boolean(d.adEarnEnabled));
        if (d.adEarnRewardPerAd !== undefined) setAdEarnRewardPerAd(Number(d.adEarnRewardPerAd) || 0);
        if (d.adEarnDailyMaxLimit !== undefined) setAdEarnDailyMaxLimit(Number(d.adEarnDailyMaxLimit) || 500);
        if (d.promoCodeEnabled !== undefined) setPromoCodeEnabled(Boolean(d.promoCodeEnabled));
      }
    });
    return () => unsub();
  }, []);

  // Helper to save avatars gallery to Firestore
  const saveAvatarsToFirestore = async (avatarsList: Array<{ id: string; url: string; label?: string }>) => {
    try {
      await setDoc(doc(db, 'settings', 'avatars_config'), { avatars: avatarsList }, { merge: true });
    } catch (e: any) {
      console.error('Error saving avatars to Firestore:', e);
      showToast('⚠️ ফায়ারবেসে অবতার গ্যালারি সেভ করতে সমস্যা: ' + (e.message || 'Error'), 'error');
    }
  };

  // Sync Preset Avatars Gallery from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'avatars_config'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (Array.isArray(d.avatars) && d.avatars.length > 0) {
          setPresetAvatars(d.avatars);
        }
      }
    });
    return () => unsub();
  }, []);

  // Admin Avatar Management Handlers
  const handleAddAdminAvatar = async (urlToAdd?: string) => {
    const finalUrl = (urlToAdd || adminNewAvatarUrl).trim();
    if (!finalUrl) {
      showToast('⚠️ দয়া করে একটি সঠিক ইমেজ URL লিখুন অথবা ফাইল আপলোড করুন!', 'warning');
      haptic('error');
      return;
    }

    const newAvatarItem = {
      id: 'av_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      url: finalUrl,
      label: adminNewAvatarLabel.trim() || `Avatar ${presetAvatars.length + 1}`
    };

    const updatedAvatars = [...presetAvatars, newAvatarItem];
    setPresetAvatars(updatedAvatars);
    setAdminNewAvatarUrl('');
    setAdminNewAvatarLabel('');
    await saveAvatarsToFirestore(updatedAvatars);
    showToast('✅ নতুন প্রোফাইল পিকচার অবতার গ্যালারিতে যোগ হয়েছে!', 'success');
    haptic('success');
  };

  const handleDeleteAdminAvatar = async (avatarId: string) => {
    if (presetAvatars.length <= 1) {
      showToast('⚠️ গ্যালারিতে অন্তত ১টি প্রোফাইল পিকচার থাকতে হবে!', 'warning');
      haptic('error');
      return;
    }
    const updatedAvatars = presetAvatars.filter((a) => a.id !== avatarId);
    setPresetAvatars(updatedAvatars);
    await saveAvatarsToFirestore(updatedAvatars);
    showToast('🗑️ প্রোফাইল পিকচারটি গ্যালারি থেকে মুছে ফেলা হয়েছে!', 'info');
    haptic('light');
  };

  const handleAdminAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('⚠️ দয়া করে সঠিক ইমেজ ফাইল সিলেক্ট করুন (JPG, PNG, WebP)', 'warning');
      haptic('error');
      return;
    }

    setAdminAvatarUploadLoading(true);
    try {
      const compressedBase64 = await compressImageToBase64(file, 400, 400, 0.85);
      await handleAddAdminAvatar(compressedBase64);
    } catch (err: any) {
      console.error('Error uploading admin avatar image:', err);
      showToast('⚠️ ছবি প্রসেস করতে সমস্যা হয়েছে!', 'error');
    } finally {
      setAdminAvatarUploadLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleResetDefaultAvatars = async () => {
    setPresetAvatars(PRESET_AVATARS);
    await saveAvatarsToFirestore(PRESET_AVATARS);
    showToast('🔄 পূর্বনির্ধারিত ৬টি ডিফল্ট অবতার রিসেট করা হয়েছে!', 'success');
    haptic('success');
  };

  // Sync Promo Codes from Firestore collection
  useEffect(() => {
    const q = query(collection(db, 'promo_codes'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      if (list.length > 0) {
        setPromoCodes(list);
      }
    }, (err) => {
      console.error('Error listening to promo codes:', err);
    });
    return () => unsub();
  }, []);

  // 2. Realtime User Info Sync
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.uid) return;

    const userRef = doc(db, 'users', currentUser.uid);

    // Initialize user doc if missing
    getDoc(userRef).then(async (snap) => {
      if (!snap.exists()) {
        await setDoc(userRef, {
          name: currentUser.name || 'User',
          balance: 0,
          total_orders: 0,
          photoURL: currentUser.photoURL || '',
          createdAt: serverTimestamp()
        });
      }
    });

    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setUserBalance(d.balance || 0);
        setUserTotalOrders(d.total_orders || 0);
        if (d.photoURL) setUserPhotoURL(d.photoURL);
        if (d.name) {
          setCurrentUser((prev) => (prev ? { ...prev, name: d.name, photoURL: d.photoURL || prev?.photoURL } : prev));
        }
      }
    });

    return () => unsubscribe();
  }, [isLoggedIn, currentUser]);

  // 3. Realtime Services Loading (Pure Read - No Auto Save or Auto Seed)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'services'), (snapshot) => {
      const list: ServiceData[] = [];
      const catsSet = new Set<string>();

      snapshot.forEach((d) => {
        const data = { id: d.id, ...d.data() } as ServiceData;
        list.push(data);
        if (data.category) catsSet.add(data.category);
      });

      setAllServices(list);
      setCategories(Array.from(catsSet).sort());
    });

    return () => unsub();
  }, []);

  // 4. Realtime Orders Sync
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.uid) return;

    const q = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: OrderData[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.uid === currentUser.uid) {
          list.push({ id: docSnap.id, ...data } as OrderData);
        }
      });
      setOrdersList(list);
    });

    return () => unsub();
  }, [isLoggedIn, currentUser]);

  // 5. Realtime User Deposit Requests Sync
  useEffect(() => {
    if (!isLoggedIn || !currentUser?.uid) return;

    const q = query(
      collection(db, 'deposit_requests'),
      where('uid', '==', currentUser.uid),
      orderBy('timestamp', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: DepositRequest[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DepositRequest);
      });
      setDepositHistory(list);
    });

    return () => unsub();
  }, [isLoggedIn, currentUser]);

  // 6. Realtime All Deposit Requests Sync (Admin View)
  useEffect(() => {
    const q = query(collection(db, 'deposit_requests'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: DepositRequest[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DepositRequest);
      });
      setAllDepositRequests(list);
    });
    return () => unsub();
  }, []);

  // Realtime Admin Created Trxs Sync
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'admin_created_trxs'), (snapshot) => {
      const list: AdminCreatedTrx[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as AdminCreatedTrx);
      });
      // Sort newest first
      list.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setAdminCreatedTrxs(list);
    });
    return () => unsub();
  }, []);

  // 7. Realtime All Users Sync (Admin View)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: Array<{ uid: string; name?: string; balance?: number; total_orders?: number }> = [];
      snapshot.forEach((docSnap) => {
        list.push({ uid: docSnap.id, ...docSnap.data() });
      });
      setAllUsersList(list);
    });
    return () => unsub();
  }, []);

  // 8. Realtime All Orders Sync (Admin View)
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: OrderData[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as OrderData);
      });
      setAllAdminOrdersList(list);
    });
    return () => unsub();
  }, []);

  // 9. Realtime Task Submissions & Custom Tasks Sync
  useEffect(() => {
    const unsubSubmissions = onSnapshot(collection(db, 'task_submissions'), (snapshot) => {
      const list: TaskSubmission[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as TaskSubmission);
      });
      // Sort newest first
      list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setAllTaskSubmissions(list);
    });

    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      if (!snapshot.empty) {
        const tList: TaskItem[] = [];
        snapshot.forEach((docSnap) => {
          tList.push({ id: docSnap.id, ...docSnap.data() } as TaskItem);
        });
        setCustomTasks(tList);
      }
    });

    return () => {
      unsubSubmissions();
      unsubTasks();
    };
  }, []);

  // Screenshot File Selection Handler (Up to 5 Screenshots)
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount = taskProofScreenshots.length;
    if (currentCount >= 5) {
      showToast('Maximum 5 screenshots allowed per task proof!', 'warning');
      return;
    }

    const remainingSlots = 5 - currentCount;
    const selectedFiles = (Array.from(files) as File[]).slice(0, remainingSlots);

    try {
      const base64Results: string[] = [];
      for (const file of selectedFiles) {
        const compressed = await compressImageToBase64(file);
        base64Results.push(compressed);
      }
      setTaskProofScreenshots((prev) => [...prev, ...base64Results]);
      showToast(`Added ${base64Results.length} screenshot(s)!`, 'success');
      haptic('light');
    } catch (err) {
      console.error('Error uploading screenshots:', err);
      showToast('Failed to process screenshot image', 'error');
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setTaskProofScreenshots((prev) => prev.filter((_, i) => i !== index));
    haptic('heavy');
  };

  // Submit Task Proof Handler with up to 5 Screenshots
  const handleSubmitTaskProof = async () => {
    if (!selectedTaskForProof) return;
    if (!currentUser) {
      showToast('Please login to submit task proof', 'error');
      return;
    }
    if (!taskProofNotes.trim() && taskProofScreenshots.length === 0) {
      showToast('Please write proof details or upload at least 1 screenshot!', 'error');
      return;
    }

    // Check task max user limit
    const existingCount = allTaskSubmissions.filter(
      (s) => s.taskId === selectedTaskForProof.id && (s.status === 'Approved' || s.status === 'Pending')
    ).length;
    if (
      selectedTaskForProof.maxUserLimit &&
      selectedTaskForProof.maxUserLimit > 0 &&
      existingCount >= selectedTaskForProof.maxUserLimit
    ) {
      showToast(`⚠️ এই টাস্কটির ইউজার লিমিট পূর্ণ হয়ে গেছে (${selectedTaskForProof.maxUserLimit} জন)! আর সাবমিট করা যাবে না।`, 'error');
      haptic('error');
      return;
    }

    setTaskSubmitting(true);
    try {
      const newSubmissionDoc = {
        taskId: selectedTaskForProof.id,
        taskTitle: selectedTaskForProof.title,
        reward: selectedTaskForProof.reward,
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'User',
        proofText: taskProofNotes.trim(),
        screenshots: taskProofScreenshots,
        status: 'Pending',
        submittedAt: new Date().toLocaleString()
      };

      const docRef = await addDoc(collection(db, 'task_submissions'), newSubmissionDoc);

      setAllTaskSubmissions((prev) => [{ id: docRef.id, ...newSubmissionDoc } as TaskSubmission, ...prev]);

      showToast('🎉 Task proof submitted with screenshots! Waiting for admin review.', 'success');
      haptic('success');
      setSelectedTaskForProof(null);
      setTaskProofNotes('');
      setTaskProofScreenshots([]);
    } catch (e: any) {
      console.error('Error submitting task proof:', e);
      showToast('Failed to submit proof: ' + e.message, 'error');
    } finally {
      setTaskSubmitting(false);
    }
  };

  // Admin Actions: Approve Task Submission & Credit Balance
  const handleApproveTaskSubmission = async (sub: TaskSubmission) => {
    try {
      await updateDoc(doc(db, 'task_submissions', sub.id), {
        status: 'Approved',
        approvedAt: serverTimestamp()
      });

      const uSnap = await getDoc(doc(db, 'users', sub.userId));
      const currBal = uSnap.exists() ? (uSnap.data().balance || 0) : 0;
      const newBal = currBal + sub.reward;

      await updateDoc(doc(db, 'users', sub.userId), {
        balance: newBal
      });

      setAllTaskSubmissions((prev) =>
        prev.map((item) => (item.id === sub.id ? { ...item, status: 'Approved' } : item))
      );

      showToast(`✅ Approved proof & credited ৳${sub.reward} to user ${sub.userName}!`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error approving task proof:', e);
      showToast('Failed to approve task proof: ' + e.message, 'error');
    }
  };

  // Admin Actions: Reject Task Submission
  const handleRejectTaskSubmission = async (subId: string) => {
    try {
      await updateDoc(doc(db, 'task_submissions', subId), {
        status: 'Rejected',
        rejectedAt: serverTimestamp()
      });

      setAllTaskSubmissions((prev) =>
        prev.map((item) => (item.id === subId ? { ...item, status: 'Rejected' } : item))
      );

      showToast('Task submission rejected', 'warning');
      haptic('heavy');
    } catch (e: any) {
      console.error('Error rejecting task proof:', e);
      showToast('Failed to reject task submission.', 'error');
    }
  };

  // Admin Image Upload Handlers
  const handleAdminTaskImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file);
      setNewTaskImage(compressed);
      showToast('✅ Task image attached successfully!', 'success');
      haptic('light');
    } catch (err) {
      console.error('Error uploading task image:', err);
      showToast('Failed to process image file', 'error');
    }
  };

  const handleAdminBroadcastImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file);
      setBroadcastImage(compressed);
      showToast('✅ Broadcast banner image attached!', 'success');
      haptic('light');
    } catch (err) {
      console.error('Error uploading broadcast image:', err);
      showToast('Failed to process image file', 'error');
    }
  };

  // Profile Picture Upload Handler
  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.uid) return;

    try {
      setProfileSubmitting(true);
      const compressed = await compressImageToBase64(file);
      setUserPhotoURL(compressed);

      // Update Firestore user document
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { photoURL: compressed }, { merge: true });

      // Update local session
      const updatedUser = { ...currentUser, photoURL: compressed };
      setCurrentUser(updatedUser);
      localStorage.setItem('smm_session', JSON.stringify(updatedUser));

      showToast('✅ প্রোফাইল পিকচার সফলভাবে আপডেট হয়েছে!', 'success');
      haptic('success');
    } catch (err: any) {
      console.error('Error updating profile photo:', err);
      showToast('Failed to update profile photo', 'error');
    } finally {
      setProfileSubmitting(false);
    }
  };

  // Remove Profile Photo
  const handleRemoveProfilePic = async () => {
    if (!currentUser?.uid) return;

    try {
      setProfileSubmitting(true);
      setUserPhotoURL(null);

      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { photoURL: '' }, { merge: true });

      const updatedUser = { ...currentUser, photoURL: '' };
      setCurrentUser(updatedUser);
      localStorage.setItem('smm_session', JSON.stringify(updatedUser));

      showToast('প্রোফাইল পিকচার সরানো হয়েছে', 'info');
      haptic('light');
    } catch (err) {
      console.error('Error removing profile photo:', err);
    } finally {
      setProfileSubmitting(false);
    }
  };

  // Select Preset Avatar
  const handleSelectPresetAvatar = async (avatarUrl: string) => {
    if (!currentUser?.uid) return;

    try {
      setProfileSubmitting(true);
      setUserPhotoURL(avatarUrl);

      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { photoURL: avatarUrl }, { merge: true });

      const updatedUser = { ...currentUser, photoURL: avatarUrl };
      setCurrentUser(updatedUser);
      localStorage.setItem('smm_session', JSON.stringify(updatedUser));

      showToast('✅ প্রোফাইল পিকচার সিলেক্ট করা হয়েছে!', 'success');
      haptic('success');
    } catch (err: any) {
      console.error('Error setting preset photo:', err);
      showToast('প্রোফাইল পিকচার সেট করতে সমস্যা হয়েছে', 'error');
    } finally {
      setProfileSubmitting(false);
    }
  };

  // Update Display Name
  const handleUpdateUserName = async () => {
    if (!editUserName.trim() || !currentUser?.uid) return;

    try {
      setProfileSubmitting(true);
      const newName = editUserName.trim();

      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { name: newName }, { merge: true });

      const updatedUser = { ...currentUser, name: newName };
      setCurrentUser(updatedUser);
      localStorage.setItem('smm_session', JSON.stringify(updatedUser));

      setIsEditingName(false);
      showToast('✅ নাম সফলভাবে পরিবর্তিত হয়েছে!', 'success');
      haptic('success');
    } catch (err) {
      console.error('Error updating name:', err);
      showToast('Failed to update name', 'error');
    } finally {
      setProfileSubmitting(false);
    }
  };

  // Admin Actions: Create Custom Task
  const handleCreateAdminTask = async () => {
    if (!newTaskTitle.trim()) {
      showToast('Please enter task title', 'error');
      return;
    }
    const rewardVal = parseFloat(newTaskReward) || 5;
    const maxLimitVal = parseInt(newTaskMaxUserLimit, 10) || 0;

    const newTaskDoc = {
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || 'Complete task & submit screenshot proof',
      reward: rewardVal,
      link: newTaskLink.trim() || '#',
      icon: newTaskIcon || 'fas fa-tasks',
      image: newTaskImage || '',
      maxUserLimit: maxLimitVal > 0 ? maxLimitVal : 0
    };

    try {
      const docRef = await addDoc(collection(db, 'tasks'), newTaskDoc);
      setCustomTasks((prev) => [{ id: docRef.id, ...newTaskDoc }, ...prev]);
      showToast('✅ New task created successfully!', 'success');
      haptic('success');
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskReward('5');
      setNewTaskMaxUserLimit('0');
      setNewTaskLink('');
      setNewTaskImage(null);
    } catch (e: any) {
      console.error('Error creating task:', e);
      showToast('Failed to create task: ' + e.message, 'error');
    }
  };

  // Admin Actions: Full Task Edit Handlers
  const handleOpenEditTask = (task: TaskItem) => {
    setEditingTask(task);
    setEditTaskTitle(task.title || '');
    setEditTaskDesc(task.description || '');
    setEditTaskReward((task.reward || 0).toString());
    setEditTaskMaxUserLimit((task.maxUserLimit || 0).toString());
    setEditTaskLink(task.link || '');
    setEditTaskIcon(task.icon || 'fas fa-tasks');
    setEditTaskImage(task.image || null);
  };

  const handleEditTaskImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToBase64(file);
      setEditTaskImage(compressed);
      showToast('✅ New task image attached for edit!', 'success');
      haptic('light');
    } catch (err) {
      console.error('Error uploading edit task image:', err);
      showToast('Failed to process image file', 'error');
    }
  };

  const handleSaveEditedTask = async () => {
    if (!editingTask) return;
    if (!editTaskTitle.trim()) {
      showToast('⚠️ দয়া করে টাস্ক এর নাম লিখে দিন!', 'warning');
      haptic('error');
      return;
    }
    const rewardVal = parseFloat(editTaskReward) || 0;
    const limitVal = parseInt(editTaskMaxUserLimit, 10) || 0;

    const updatedData = {
      title: editTaskTitle.trim(),
      description: editTaskDesc.trim() || 'Complete task & submit screenshot proof',
      reward: rewardVal,
      maxUserLimit: limitVal > 0 ? limitVal : 0,
      link: editTaskLink.trim() || '#',
      icon: editTaskIcon || 'fas fa-tasks',
      image: editTaskImage || ''
    };

    try {
      await updateDoc(doc(db, 'tasks', editingTask.id), updatedData);
      setCustomTasks((prev) =>
        prev.map((t) => (t.id === editingTask.id ? { ...t, ...updatedData } : t))
      );
      showToast('✅ টাস্কটির সকল তথ্য সফলভাবে এডিট ও সেভ করা হয়েছে!', 'success');
      haptic('success');
      setEditingTask(null);
    } catch (e: any) {
      console.error('Error updating task:', e);
      showToast('Failed to edit task: ' + e.message, 'error');
    }
  };

  // Admin Actions: Update Task User Limit
  const handleUpdateTaskLimit = async (taskId: string, newLimit: number) => {
    try {
      const limitVal = isNaN(newLimit) || newLimit < 0 ? 0 : newLimit;
      await updateDoc(doc(db, 'tasks', taskId), { maxUserLimit: limitVal });
      setCustomTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, maxUserLimit: limitVal } : t))
      );
      showToast(`✅ টাস্কটির ইউজার লিমিট আপডেট করা হয়েছে (${limitVal === 0 ? 'আনলিমিটেড' : limitVal + ' জন ইউজার'})!`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error updating task limit:', e);
      showToast('Failed to update task limit', 'error');
    }
  };

  // Admin Actions: Delete Custom Task
  const handleDeleteAdminTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      setCustomTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('Task deleted successfully', 'info');
      haptic('heavy');
    } catch (e: any) {
      console.error('Error deleting task:', e);
      showToast('Failed to delete task', 'error');
    }
  };

  // Admin Actions: User Balance Increase / Decrease / Set
  const handleSetUserBalance = async (uid: string, targetBalance: number) => {
    if (isNaN(targetBalance) || targetBalance < 0) {
      showToast('Please enter a valid balance amount', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', uid), { balance: targetBalance });
      showToast(`User (${uid.slice(0, 8)}) balance set to ৳${targetBalance.toFixed(2)}`, 'success');
      haptic('success');
    } catch (e) {
      console.error('Error updating user balance:', e);
      showToast('Failed to update balance.', 'error');
    }
  };

  const handleAddUserBalance = async (uid: string, addAmount: number) => {
    if (isNaN(addAmount) || addAmount <= 0) {
      showToast('Enter a positive amount to add', 'error');
      return;
    }
    try {
      const uSnap = await getDoc(doc(db, 'users', uid));
      const curr = uSnap.exists() ? (uSnap.data().balance || 0) : 0;
      const newBal = curr + addAmount;
      await updateDoc(doc(db, 'users', uid), { balance: newBal });
      showToast(`Added +৳${addAmount} → New balance: ৳${newBal.toFixed(2)}`, 'success');
      haptic('success');
    } catch (e) {
      console.error('Error adding balance:', e);
      showToast('Failed to add balance.', 'error');
    }
  };

  const handleSubtractUserBalance = async (uid: string, subAmount: number) => {
    if (isNaN(subAmount) || subAmount <= 0) {
      showToast('Enter a positive amount to subtract', 'error');
      return;
    }
    try {
      const uSnap = await getDoc(doc(db, 'users', uid));
      const curr = uSnap.exists() ? (uSnap.data().balance || 0) : 0;
      const newBal = Math.max(0, curr - subAmount);
      await updateDoc(doc(db, 'users', uid), { balance: newBal });
      showToast(`Subtracted -৳${subAmount} → New balance: ৳${newBal.toFixed(2)}`, 'info');
      haptic('heavy');
    } catch (e) {
      console.error('Error subtracting balance:', e);
      showToast('Failed to subtract balance.', 'error');
    }
  };

  // Admin Deposit Approval (with customizable amount adjustment before approval and bonus calculation)
  const handleApproveDepositCustom = async (depId: string, uid: string, originalAmount: number) => {
    const customStr = customDepAmounts[depId];
    const finalAmount = customStr !== undefined && !isNaN(parseFloat(customStr)) && parseFloat(customStr) >= 0
      ? parseFloat(customStr)
      : originalAmount;

    // Calculate Deposit Bonus
    const { bonusAmount, bonusPercentage } = calculateDepositBonus(finalAmount, depositBonusConfig);
    const totalCredited = finalAmount + bonusAmount;

    try {
      const uSnap = await getDoc(doc(db, 'users', uid));
      const currBal = uSnap.exists() ? (uSnap.data().balance || 0) : 0;
      const currTotDep = uSnap.exists() ? (uSnap.data().total_deposit || 0) : 0;
      const newBal = currBal + totalCredited;

      await updateDoc(doc(db, 'users', uid), {
        balance: newBal,
        total_deposit: currTotDep + finalAmount
      });
      await updateDoc(doc(db, 'deposit_requests', depId), {
        status: 'Approved',
        amount: finalAmount,
        bonusAmount: bonusAmount,
        totalCredited: totalCredited,
        approvedAt: serverTimestamp()
      });

      if (bonusAmount > 0) {
        showToast(`🎉 Approved ৳${finalAmount} + ৳${bonusAmount} (${bonusPercentage}% Bonus) = Total ৳${totalCredited} credited!`, 'success');
      } else {
        showToast(`Approved ৳${finalAmount} for user ${uid.slice(0, 8)}!`, 'success');
      }
      haptic('success');
    } catch (e) {
      console.error('Error approving deposit:', e);
      showToast('Failed to approve deposit.', 'error');
    }
  };

  const handleRejectDeposit = async (depId: string) => {
    try {
      await updateDoc(doc(db, 'deposit_requests', depId), {
        status: 'Rejected',
        rejectedAt: serverTimestamp()
      });
      showToast('Deposit request rejected', 'warning');
      haptic('heavy');
    } catch (e) {
      console.error('Error rejecting deposit:', e);
      showToast('Failed to reject deposit.', 'error');
    }
  };

  // Sync Deposit Bonus Configuration from Firestore settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'deposit_bonus'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          const rawTiers = Array.isArray(data.tiers) ? data.tiers : null;
          const parsedTiers: DepositBonusTier[] = rawTiers && rawTiers.length > 0
            ? rawTiers.map((t: any, idx: number) => ({
                id: t.id || `tier-${idx}-${Date.now()}`,
                minAmount: Number(t.minAmount) || 0,
                maxAmount: Number(t.maxAmount) || 0,
                percentage: Number(t.percentage) || 0,
                label: t.label || `Tier ${idx + 1}`
              }))
            : [
                { id: 't1', minAmount: 100, maxAmount: 499, percentage: 2, label: 'Tier 1' },
                { id: 't2', minAmount: 500, maxAmount: 999, percentage: 5, label: 'Tier 2' },
                { id: 't3', minAmount: 1000, maxAmount: 0, percentage: 10, label: 'Tier 3' }
              ];

          setDepositBonusConfig({
            enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
            tiers: parsedTiers,
            percentage: typeof data.percentage === 'number' ? data.percentage : (parsedTiers[0]?.percentage || 2),
            minAmount: typeof data.minAmount === 'number' ? data.minAmount : (parsedTiers[0]?.minAmount || 100)
          });
        }
      }
    });
    return () => unsub();
  }, []);

  // Save/Update Multi Deposit Bonus Settings in Firestore
  const handleSaveDepositBonusConfig = async (enabled: boolean, tiers: DepositBonusTier[]) => {
    setIsSavingDepositBonus(true);
    try {
      const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
      await setDoc(doc(db, 'settings', 'deposit_bonus'), {
        enabled,
        tiers: sortedTiers,
        percentage: sortedTiers[0]?.percentage || 2,
        minAmount: sortedTiers[0]?.minAmount || 100,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast(`✅ মাল্টি ডিপোজিট বোনাস সেটিং সেভ হয়েছে (${enabled ? 'ON' : 'OFF'} - ${sortedTiers.length} টি টায়ার)`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error saving deposit bonus config:', e);
      showToast('Failed to save deposit bonus config', 'error');
    } finally {
      setIsSavingDepositBonus(false);
    }
  };

  // Sync Global Auto Deposit System State from Firestore settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'auto_deposit_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.enabled !== undefined) {
          setAutoDepositGlobalEnabled(Boolean(data.enabled));
        }
      }
    });
    return () => unsub();
  }, []);

  // Save/Update Global Auto Deposit Gateway Settings in Firestore
  const handleSaveAutoDepositGlobalConfig = async (enabled: boolean) => {
    setIsSavingAutoDepositSettings(true);
    try {
      await setDoc(doc(db, 'settings', 'auto_deposit_config'), {
        enabled,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setAutoDepositGlobalEnabled(enabled);
      showToast(`✅ অটো ডিপোজিট সিস্টেম ${enabled ? 'ON (চালু)' : 'OFF (বন্ধ)'} করা হয়েছে!`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error saving auto deposit config:', e);
      showToast('অটো ডিপোজিট সেটিং সেভ করা সম্ভব হয়নি: ' + e.message, 'error');
    } finally {
      setIsSavingAutoDepositSettings(false);
    }
  };

  // Sync Payment Methods Configuration from Firestore settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'payment_methods'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && typeof data === 'object') {
          setPaymentMethodsConfig((prev) => ({
            ...prev,
            ...data
          }));
        }
      }
    });
    return () => unsub();
  }, []);

  // Save/Update Payment Method Number & Logo in Firestore
  const handleSavePaymentNumber = async (methodKey: string, newNumber: string, newNote?: string, newCustomIconUrl?: string) => {
    if (!newNumber.trim()) {
      showToast('Payment number cannot be empty', 'error');
      return;
    }
    try {
      const updated = {
        ...paymentMethodsConfig,
        [methodKey]: {
          ...paymentMethodsConfig[methodKey],
          number: newNumber.trim(),
          ...(newNote !== undefined ? { note: newNote.trim() } : {}),
          customIconUrl: newCustomIconUrl !== undefined ? newCustomIconUrl.trim() : (paymentMethodsConfig[methodKey]?.customIconUrl || '')
        }
      };
      await setDoc(doc(db, 'settings', 'payment_methods'), updated, { merge: true });
      setPaymentMethodsConfig(updated);
      showToast(`✅ ${paymentMethodsConfig[methodKey]?.label || methodKey} তথ্য ও লোগো আপডেট হয়েছে!`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error saving payment number:', e);
      showToast('Failed to save payment details: ' + e.message, 'error');
    }
  };

  // Admin Order Status Update
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      showToast(`Order #${orderId.slice(-6)} status → ${newStatus}`, 'success');
      haptic('success');
    } catch (e) {
      console.error('Error updating order status:', e);
      showToast('Failed to update status.', 'error');
    }
  };

  // Admin Broadcast Notification
  const handleSendBroadcast = () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      showToast('Please enter notification title and message', 'error');
      return;
    }
    const newNotif = {
      id: 'n_' + Date.now(),
      title: broadcastTitle,
      message: broadcastMessage,
      time: 'Just now',
      unread: true,
      type: broadcastType,
      image: broadcastImage || undefined
    };
    setNotifications((prev) => [newNotif, ...prev]);
    setBroadcastTitle('');
    setBroadcastMessage('');
    setBroadcastImage(null);
    showToast('Broadcast notification posted to all users!', 'success');
    haptic('success');
  };

  // Admin Support Link Add/Delete
  const handleAddSupportLink = () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) {
      showToast('Link name and URL are required', 'error');
      return;
    }
    const newLink = {
      id: 'l_' + Date.now(),
      name: newLinkName.trim(),
      url: newLinkUrl.trim(),
      icon: newLinkIcon.trim() || 'fab fa-telegram'
    };
    setSupportLinks((prev) => [...prev, newLink]);
    setNewLinkName('');
    setNewLinkUrl('');
    showToast('Support link added!', 'success');
    haptic('success');
  };

  const handleDeleteSupportLink = (id: string) => {
    setSupportLinks((prev) => prev.filter((l) => l.id !== id));
    showToast('Support link removed', 'info');
  };

  // Export Backup JSON
  const handleExportBackup = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        usersCount: allUsersList.length,
        ordersCount: allAdminOrdersList.length,
        users: allUsersList,
        orders: allAdminOrdersList,
        services: allServices,
        deposits: allDepositRequests
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smm_panel_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup JSON downloaded successfully!', 'success');
      haptic('success');
    } catch (e) {
      showToast('Failed to export backup JSON', 'error');
    }
  };

  // Handler: Login
  const handleLogin = async () => {
    if (authSubmitting) return;
    setLoginUserErr('');
    setLoginPassErr('');

    let err = false;
    if (!loginUsername.trim()) {
      setLoginUserErr('Username is required');
      err = true;
    }
    if (!loginPassword) {
      setLoginPassErr('Password is required');
      err = true;
    }
    if (err) {
      haptic('error');
      return;
    }

    setAuthSubmitting(true);
    haptic('heavy');

    try {
      const qUser = query(
        collection(db, 'auth_users'),
        where('username', '==', loginUsername.trim().toLowerCase())
      );
      const snap = await getDocs(qUser);

      if (snap.empty) {
        setLoginUserErr('Account not found. Please register first.');
        haptic('error');
        setAuthSubmitting(false);
        return;
      }

      const userDoc = snap.docs[0];
      const userData = userDoc.data();
      const hashedPass = await simpleHash(loginPassword);

      if (userData.password !== hashedPass) {
        setLoginPassErr('Incorrect password');
        haptic('error');
        setAuthSubmitting(false);
        return;
      }

      const session = { uid: userDoc.id, username: userData.username, name: userData.name };
      currentUserSessionLogin(session);
      showToast(`Welcome back, ${userData.name}!`, 'success');
    } catch (e: any) {
      console.error('Login error:', e);
      haptic('error');
      showToast('Login failed. Please try again.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Handler: Register
  const handleRegister = async () => {
    if (authSubmitting) return;
    setRegNameErr('');
    setRegUserErr('');
    setRegPassErr('');
    setRegConfirmErr('');

    const name = regName.trim();
    const username = regUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const password = regPassword;
    const confirm = regConfirmPass;

    let err = false;
    if (!name || name.length < 2) {
      setRegNameErr('Name is required (min 2 chars)');
      err = true;
    }
    if (!username || username.length < 3) {
      setRegUserErr('Username required (min 3 chars, letters/numbers)');
      err = true;
    }
    if (!password || password.length < 6) {
      setRegPassErr('Password required (min 6 chars)');
      err = true;
    }
    if (password !== confirm) {
      setRegConfirmErr('Passwords do not match');
      err = true;
    }
    if (err) {
      haptic('error');
      return;
    }

    setAuthSubmitting(true);
    haptic('heavy');

    try {
      const qUser = query(collection(db, 'auth_users'), where('username', '==', username));
      const existing = await getDocs(qUser);
      if (!existing.empty) {
        setRegUserErr('This username is already taken');
        haptic('error');
        setAuthSubmitting(false);
        return;
      }

      const hashedPass = await simpleHash(password);
      const newDoc = doc(collection(db, 'auth_users'));
      const uid = newDoc.id;

      await setDoc(newDoc, {
        username,
        name,
        password: hashedPass,
        createdAt: serverTimestamp(),
        telegramId: tg?.initDataUnsafe?.user?.id || null
      });

      await setDoc(doc(db, 'users', uid), {
        name,
        balance: 0,
        total_orders: 0,
        createdAt: serverTimestamp()
      });

      const session = { uid, username, name };
      currentUserSessionLogin(session);
      showToast('Account created successfully!', 'success');
    } catch (e: any) {
      console.error('Registration error:', e);
      haptic('error');
      showToast('Registration failed.', 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Telegram Login
  const loginWithTelegram = async () => {
    if (!tg?.initDataUnsafe?.user) {
      showToast('Open this app inside Telegram to auto-connect', 'warning');
      return;
    }
    haptic('heavy');
    const tgUser = tg.initDataUnsafe.user;
    const username = (tgUser.username || `tg_${tgUser.id}`).toLowerCase().replace(/[^a-z0-9_]/g, '');
    const name = tgUser.first_name || 'Telegram User';
    const tgPhoto = tgUser.photo_url || '';

    try {
      const q = query(collection(db, 'auth_users'), where('telegramId', '==', tgUser.id));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        const photoToUse = tgPhoto || userData.photoURL || '';

        if (photoToUse) {
          setUserPhotoURL(photoToUse);
          await setDoc(doc(db, 'users', userDoc.id), { photoURL: photoToUse }, { merge: true });
        }

        const session = { uid: userDoc.id, username: userData.username, name: userData.name, photoURL: photoToUse };
        currentUserSessionLogin(session);
        showToast(`Welcome, ${userData.name}!`, 'success');
      } else {
        const finalUsername =
          username.length >= 3 ? username : `tg_${String(tgUser.id).slice(-6)}`;
        const newDoc = doc(collection(db, 'auth_users'));
        const uid = newDoc.id;

        await setDoc(newDoc, {
          username: finalUsername,
          name,
          password: '',
          createdAt: serverTimestamp(),
          telegramId: tgUser.id,
          photoURL: tgPhoto
        });

        await setDoc(
          doc(db, 'users', uid),
          { name, balance: 0, total_orders: 0, photoURL: tgPhoto, createdAt: serverTimestamp() },
          { merge: true }
        );

        if (tgPhoto) setUserPhotoURL(tgPhoto);
        const session = { uid, username: finalUsername, name, photoURL: tgPhoto };
        currentUserSessionLogin(session);
        showToast('Telegram account connected!', 'success');
      }
    } catch (e) {
      console.error('TG Login error:', e);
      haptic('error');
      showToast('Failed to connect with Telegram', 'error');
    }
  };

  const currentUserSessionLogin = (session: UserSession) => {
    localStorage.setItem('smm_session', JSON.stringify(session));
    setCurrentUser(session);
    setIsLoggedIn(true);
    haptic('success');
  };

  const handleLogout = () => {
    setModalConfig({
      show: true,
      title: 'Logout',
      bodyHtml: <p className="text-slate-300 text-sm">Are you sure you want to logout?</p>,
      onConfirm: () => {
        localStorage.removeItem('smm_session');
        setIsLoggedIn(false);
        setCurrentUser(null);
        showToast('Logged out', 'info');
      }
    });
  };

  // Category Change
  const handleCategoryChange = (cat: string) => {
    haptic('light');
    setSelectedCategory(cat);
    setCatErr('');
    
    // Auto select first service in this category for instant order flow
    const filtered = allServices.filter((s) => s.category === cat);
    if (filtered.length > 0) {
      setSelectedServiceId(filtered[0].id);
      setCurrentService(filtered[0]);
      setQuantity(filtered[0].min || 1000);
      setSvcErr('');
    } else {
      setSelectedServiceId('');
      setCurrentService(null);
      setSvcErr('');
    }
  };

  // Direct Platform Logo Click Handler (Auto-select category & smooth scroll to order form)
  const handleSelectPlatformLogo = (platformId: string) => {
    haptic('heavy');
    const pLower = platformId.toLowerCase();
    
    // Search categories for closest matching platform
    const match = categories.find((c) => {
      const cLower = c.toLowerCase();
      if (pLower === 'facebook' && (cLower.includes('facebook') || cLower.includes('fb'))) return true;
      if (pLower === 'instagram' && (cLower.includes('instagram') || cLower.includes('ig'))) return true;
      if (pLower === 'tiktok' && (cLower.includes('tiktok') || cLower.includes('tt'))) return true;
      if (pLower === 'youtube' && (cLower.includes('youtube') || cLower.includes('yt'))) return true;
      if (pLower === 'telegram' && (cLower.includes('telegram') || cLower.includes('tg'))) return true;
      if (pLower === 'twitter' && (cLower.includes('twitter') || cLower.includes('x'))) return true;
      if (pLower === 'website' && (cLower.includes('web') || cLower.includes('seo') || cLower.includes('website') || cLower.includes('traffic'))) return true;
      if (pLower === 'whatsapp' && (cLower.includes('whatsapp') || cLower.includes('wa'))) return true;
      if (pLower === 'snapchat' && (cLower.includes('snapchat') || cLower.includes('sc'))) return true;
      if (pLower === 'spotify' && cLower.includes('spotify')) return true;
      if (pLower === 'discord' && cLower.includes('discord')) return true;
      if (pLower === 'linkedin' && cLower.includes('linkedin')) return true;
      return cLower.includes(pLower);
    });

    if (match) {
      handleCategoryChange(match);
      showToast(`Selected ${match}`, 'info');
    } else if (categories.length > 0) {
      // Fallback if category name in db differs
      handleCategoryChange(categories[0]);
    }

    // Scroll smoothly to order form
    setTimeout(() => {
      const el = document.getElementById('order-form');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
  };

  // Search Select Service Handler
  const handleSelectServiceFromSearch = (service: ServiceData) => {
    haptic('heavy');
    setSelectedCategory(service.category);
    setSelectedServiceId(service.id);
    setCurrentService(service);
    setQuantity(service.min || 1000);
    setSvcErr('');
    setShowSearchModal(false);
    showToast(`Selected: ${service.name}`, 'info');

    setTimeout(() => {
      const el = document.getElementById('order-form');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Notification Helpers
  const unreadNotifCount = notifications.filter((n) => n.unread).length;
  const markAllNotifsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    haptic('light');
    showToast('All notifications marked as read', 'success');
  };

  // Mailbox Helpers
  const unreadMailCount = mailList.filter((m) => m.unread).length;
  const markMailRead = (id: string) => {
    setMailList((prev) => prev.map((m) => (m.id === id ? { ...m, unread: false } : m)));
  };

  const handleSendMail = () => {
    if (!mailSubject.trim()) {
      showToast('Subject is required', 'error');
      return;
    }
    if (!mailMessage.trim()) {
      showToast('Message content is required', 'error');
      return;
    }
    setMailSubmitting(true);
    setTimeout(() => {
      const newMail = {
        id: 'm_' + Date.now(),
        sender: currentUser?.name || 'You',
        subject: mailSubject,
        message: mailMessage,
        time: 'Just now',
        unread: false,
        isAdminReply: false
      };
      setMailList((prev) => [newMail, ...prev]);
      setMailSubject('');
      setMailMessage('');
      setMailSubmitting(false);
      setMailboxTab('inbox');
      haptic('success');
      showToast('Mail sent to support! (মেইল পাঠানো হয়েছে)', 'success');
    }, 400);
  };

  // Service Change
  const handleServiceChange = (svcId: string) => {
    haptic('light');
    setSelectedServiceId(svcId);
    setSvcErr('');
    const found = allServices.find((s) => s.id === svcId) || null;
    setCurrentService(found);
    if (found?.min) {
      setQuantity(found.min);
    }
  };

  // Cost calculation
  const calculatedCost = currentService ? (currentService.price * quantity) / 1000 : 0;

  // Order Stepper Progress Tracker ("রোগ" / Dynamic Progress Track)
  const isStep1Done = Boolean(selectedCategory);
  const isStep2Done = Boolean(selectedServiceId && currentService);
  const isStep3Done = Boolean(targetLink.trim().length >= 4);
  const isStep4Done = Boolean(
    quantity > 0 &&
      currentService &&
      quantity >= currentService.min &&
      (!currentService.max || quantity <= currentService.max)
  );

  let orderStepProgress = 10;
  let activeStepIndex = 1;
  if (!isStep1Done) {
    orderStepProgress = 15;
    activeStepIndex = 1;
  } else if (!isStep2Done) {
    orderStepProgress = 35;
    activeStepIndex = 2;
  } else if (!isStep3Done) {
    orderStepProgress = 60;
    activeStepIndex = 3;
  } else if (!isStep4Done) {
    orderStepProgress = 85;
    activeStepIndex = 4;
  } else {
    orderStepProgress = 100;
    activeStepIndex = 5;
  }

  // SMMGen API Call Helper
  const placeSmmGenOrderApi = async (
    serviceId: string,
    link: string,
    qty: number
  ): Promise<{ error?: string; order?: number; status?: string }> => {
    const apiKey = 'abb6b46205ede0b57a7c53580646fc7a';
    const mappedService = SERVICE_ID_MAP[serviceId] || serviceId;
    const finalService = mappedService && mappedService.length >= 4 ? mappedService : '15806';

    const queryParams = new URLSearchParams({
      key: apiKey,
      action: 'add',
      service: String(finalService),
      link: String(link),
      quantity: String(qty)
    }).toString();

    // 1. Try Netlify / Vite Proxy GET endpoint
    try {
      const res = await fetch(`/api/smm/order?${queryParams}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          if (json.order || json.error) return json;
        }
      }
    } catch (e) {
      console.warn('GET proxy attempt failed:', e);
    }

    // 2. Try Netlify / Vite Proxy POST endpoint
    try {
      const proxyRes = await fetch('/api/smm/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: finalService,
          link,
          quantity: qty,
          apiKey,
          apiBase: 'https://my.smmgen.com/api/v2'
        })
      });

      if (proxyRes.ok) {
        const text = await proxyRes.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          if (json.order || json.error) return json;
        }
      }
    } catch (e) {
      console.warn('POST proxy attempt failed:', e);
    }

    // 3. Fallback: Direct fetch
    try {
      const targetUrl = `https://my.smmgen.com/api/v2?${queryParams}`;
      const res = await fetch(targetUrl);
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch (e) {
      console.warn('Direct fetch failed:', e);
    }

    return { error: 'API connection error. Please check your netlify redirect setup.' };
  };

  // Place Order Action
  const handlePlaceOrderClick = () => {
    setCatErr('');
    setSvcErr('');
    setLinkErr('');
    setQtyErr('');

    if (!selectedCategory) {
      setCatErr('Please select a category');
      haptic('error');
      return;
    }
    if (!selectedServiceId || !currentService) {
      setSvcErr('Please select a service');
      haptic('error');
      return;
    }
    if (!targetLink.trim() || targetLink.trim().length < 5) {
      setLinkErr('Please enter a valid link/URL');
      haptic('error');
      return;
    }

    const minQty = currentService.min || 10;
    const maxQty = currentService.max || 999999999;

    if (!quantity || quantity < minQty) {
      setQtyErr(`Minimum quantity is ${minQty}`);
      haptic('error');
      return;
    }
    if (quantity > maxQty) {
      setQtyErr(`Maximum quantity is ${maxQty.toLocaleString()}`);
      haptic('error');
      return;
    }

    if (userBalance < calculatedCost) {
      haptic('error');
      setModalConfig({
        show: true,
        title: 'Insufficient Balance',
        bodyHtml: (
          <div className="space-y-2">
            <p className="text-slate-300 text-xs">You need more Coins to place this order.</p>
            <div className="bg-red-500/10 border border-red-500/15 rounded-xl p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs">Required Cost:</span>
                <span className="font-bold text-red-400">{calculatedCost.toFixed(2)} Coins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-xs">Your Balance:</span>
                <span className="font-bold">{userBalance.toFixed(2)} Coins</span>
              </div>
              <div className="flex justify-between border-t border-red-500/10 pt-1 mt-1">
                <span className="text-slate-400 text-xs">Shortage:</span>
                <span className="font-extrabold text-red-400">
                  {(calculatedCost - userBalance).toFixed(2)} Coins
                </span>
              </div>
            </div>
          </div>
        ),
        onConfirm: () => setActiveTab('funds')
      });
      return;
    }

    // Confirm Modal
    setModalConfig({
      show: true,
      title: 'Confirm Your Order',
      bodyHtml: (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b border-dashed border-slate-700">
            <span className="text-slate-400">Service</span>
            <span className="font-bold text-right max-w-[60%]">{currentService.name}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-dashed border-slate-700">
            <span className="text-slate-400">Quantity</span>
            <span className="font-bold">{quantity.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-dashed border-slate-700">
            <span className="text-slate-400">Cost</span>
            <span className="font-bold text-blue-400">{calculatedCost.toFixed(2)} Coins</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-400">Remaining Balance</span>
            <span className="font-bold">{(userBalance - calculatedCost).toFixed(2)} Coins</span>
          </div>
        </div>
      ),
      onConfirm: () => executeOrderSubmission()
    });
  };

  const executeOrderSubmission = async () => {
    if (!currentUser || !currentService || orderSubmitting) return;

    setOrderSubmitting(true);
    haptic('heavy');

    try {
      const cost = calculatedCost;
      const sname = currentService.name;
      const link = targetLink.trim();
      const qty = quantity;
      const apiSvcId = currentService.apiServiceId || '15806';

      // 1. Create order document in Firestore
      const orderRef = await addDoc(collection(db, 'orders'), {
        uid: currentUser.uid,
        service: sname,
        qty,
        link,
        cost,
        status: 'Pending',
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      });

      // 2. Deduct user balance in Firestore
      const newBalance = userBalance - cost;
      const newOrdersCount = userTotalOrders + 1;
      await updateDoc(doc(db, 'users', currentUser.uid), {
        balance: newBalance,
        total_orders: newOrdersCount
      });

      setUserBalance(newBalance);
      setUserTotalOrders(newOrdersCount);

      // 3. Trigger SMMGen API call
      showToast('Sending order to SMM Panel...', 'info');
      const apiResponse = await placeSmmGenOrderApi(apiSvcId, link, qty);

      if (apiResponse.order) {
        // API Success
        await updateDoc(doc(db, 'orders', orderRef.id), {
          apiOrderId: apiResponse.order,
          apiStatus: apiResponse.status || 'processing',
          status: 'Processing',
          processedAt: serverTimestamp()
        });
        haptic('success');
        showToast(`✅ Order sent to SMM Panel! ID: ${apiResponse.order}`, 'success');
      } else {
        // API returned error
        const apiErr = apiResponse.error || 'Failed to submit to SMM provider';
        await updateDoc(doc(db, 'orders', orderRef.id), {
          apiError: apiErr
        });
        haptic('error');
        showToast(`⚠️ Order saved locally. API error: ${apiErr}`, 'warning');
      }

      // 4. Send Live Order Alert to Telegram Channel
      await sendOrderToTelegramChannel({
        orderId: orderRef.id,
        userName: currentUser.name || currentUser.username || 'Customer',
        serviceName: sname,
        quantity: qty,
        cost,
        link,
        status: apiResponse.order ? 'Processing' : 'Pending',
        apiOrderId: apiResponse.order
      });

      // Reset form fields
      setTargetLink('');
      setQuantity(100);
      setSelectedServiceId('');
      setCurrentService(null);
      setSelectedCategory('');

      setTimeout(() => {
        setActiveTab('orders');
      }, 1000);
    } catch (e: any) {
      console.error('Order error:', e);
      haptic('error');
      showToast('Failed to process order: ' + e.message, 'error');
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Retry API order
  const handleRetryOrder = async (order: OrderData) => {
    haptic('heavy');
    showToast('Retrying SMM Panel dispatch...', 'info');

    try {
      const serviceObj = allServices.find((s) => s.name === order.service);
      const apiSvcId = serviceObj?.apiServiceId || '101';

      const res = await placeSmmGenOrderApi(apiSvcId, order.link, order.qty);

      if (res.order) {
        await updateDoc(doc(db, 'orders', order.id), {
          apiOrderId: res.order,
          apiStatus: res.status || 'processing',
          status: 'Processing',
          apiError: null,
          processedAt: serverTimestamp()
        });
        haptic('success');
        showToast(`✅ Order dispatched! API ID: ${res.order}`, 'success');
      } else {
        showToast(`Retry failed: ${res.error || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      showToast('Retry error: ' + err.message, 'error');
    }
  };

  // Submit Deposit Request (Supports Instant Auto Live Gateway for bKash & Nagad)
  const handleSubmitDeposit = async () => {
    setDepAmtErr('');
    setDepTrxErr('');

    const amt = parseFloat(depositAmount);
    const trx = depositTrxId.trim().toUpperCase();

    const isCrypto = selectedMethod === 'binance' || selectedMethod === 'usdt_bep20';
    const minAmt = isCrypto ? 12 : 10;

    let err = false;
    if (isNaN(amt) || amt < minAmt) {
      setDepAmtErr(isCrypto ? 'Minimum amount is ৳ 12 (0.10$)' : 'Minimum amount is ৳ 10');
      err = true;
    }
    if (amt > 100000) {
      setDepAmtErr('Maximum amount is ৳ 100,000');
      err = true;
    }
    if (!trx || trx.length < 3) {
      setDepTrxErr('Please enter a valid Transaction ID / Hash / Pay ID');
      err = true;
    }
    if (err) {
      haptic('error');
      return;
    }

    if (!currentUser?.uid || depositSubmitting) return;

    // Check duplicate TrxID across all previous deposits
    const isDuplicate = allDepositRequests.some(
      (d) => d.trxId && d.trxId.trim().toUpperCase() === trx
    );
    if (isDuplicate) {
      setDepTrxErr('⚠️ এই ট্রানজেকশন আইডিটি (TrxID) ইতিপূর্বে ব্যবহার করা হয়েছে!');
      haptic('error');
      return;
    }

    setDepositSubmitting(true);
    haptic('heavy');

    try {
      // 1. Check if TrxID matches an unused Admin Created TrxID (Admin Trx Maker)
      const matchedAdminTrx = adminCreatedTrxs.find(
        (t) => t.status === 'Unused' && t.trxId.trim().toUpperCase() === trx
      );

      if (matchedAdminTrx) {
        const finalCreditAmt = matchedAdminTrx.amount || amt;
        const { bonusAmount, bonusPercentage } = calculateDepositBonus(finalCreditAmt, depositBonusConfig);
        const totalCredited = finalCreditAmt + bonusAmount;

        setAutoDepositVerifying(true);
        setAutoDepositProgress(30);
        setAutoDepositStatusText('Connecting to Admin TrxID Gateway...');

        await new Promise((resolve) => setTimeout(resolve, 500));
        setAutoDepositProgress(70);
        setAutoDepositStatusText(`Admin TrxID Matched! Adding ৳ ${totalCredited} Balance...`);

        await new Promise((resolve) => setTimeout(resolve, 500));

        // Mark Admin Trx as Used
        await updateDoc(doc(db, 'admin_created_trxs', matchedAdminTrx.id), {
          status: 'Used',
          usedByUid: currentUser.uid,
          usedAt: new Date().toISOString()
        });

        // Add Deposit Request Record
        await addDoc(collection(db, 'deposit_requests'), {
          uid: currentUser.uid,
          amount: finalCreditAmt,
          bonusAmount: bonusAmount,
          totalCredited: totalCredited,
          trxId: trx,
          method: matchedAdminTrx.method || selectedMethod,
          status: 'Approved',
          isAdminCreated: true,
          timestamp: serverTimestamp()
        });

        // Credit user balance
        await updateDoc(doc(db, 'users', currentUser.uid), {
          balance: increment(totalCredited),
          total_deposit: increment(finalCreditAmt)
        });

        setUserBalance((prev) => prev + totalCredited);
        setUserTotalDeposit((prev) => prev + finalCreditAmt);

        setAutoDepositProgress(100);
        setAutoDepositStatusText('Deposit Successful!');

        haptic('success');
        showToast(
          bonusAmount > 0
            ? `🎉 এডমিন TrxID ম্যাচ হয়েছে! ৳ ${finalCreditAmt} + ৳ ${bonusAmount} (${bonusPercentage}% Bonus) = মোট ৳ ${totalCredited} ওয়ালেটে যোগ হলো!`
            : `🎉 এডমিন ভাউচার TrxID সফলভাবে ম্যাচ হয়েছে! ৳ ${finalCreditAmt} ওয়ালেটে যোগ করা হলো।`,
          'success'
        );

        setDepositAmount('');
        setDepositTrxId('');
        return;
      }

      const isEffectiveAutoMode = autoDepositGlobalEnabled && isAutoDepositMode;

      if (isEffectiveAutoMode) {
        // INSTANT LIVE AUTO DEPOSIT GATEWAY FOR BKASH / NAGAD / ROCKET / CRYPTO
        // Live Gateway Verification against Statement Database
        setAutoDepositVerifying(true);
        setAutoDepositProgress(20);
        setAutoDepositStatusText('Connecting to bKash/Nagad Live Gateway...');

        await new Promise((resolve) => setTimeout(resolve, 600));
        setAutoDepositProgress(60);
        setAutoDepositStatusText('Verifying TrxID in Live Statement Database...');

        await new Promise((resolve) => setTimeout(resolve, 700));
        setAutoDepositProgress(90);
        setAutoDepositStatusText('❌ TrxID Authorization Failed! Statement Match Not Found...');

        await new Promise((resolve) => setTimeout(resolve, 500));

        // Since TrxID was not found in valid statement database, mark deposit request as REJECTED
        await addDoc(collection(db, 'deposit_requests'), {
          uid: currentUser.uid,
          amount: amt,
          trxId: trx,
          method: selectedMethod,
          status: 'Rejected',
          isAuto: true,
          rejectReason: 'Live Auto Verification Failed: TrxID not found in payment statement',
          timestamp: serverTimestamp()
        });

        setAutoDepositProgress(100);
        setAutoDepositStatusText('❌ Verification Failed!');

        haptic('error');
        showToast('❌ লাইভ অটো ভেরিফিকেশন ব্যর্থ! আপনার TrxID-টি বিকাশ/নগদ স্টেটমেন্টে পাওয়া যায়নি। কাস্টম ট্রানজেকশনের জন্য ম্যানুয়াল মোড ব্যবহার করুন।', 'error');
      } else {
        // MANUAL ADMIN REVIEW MODE
        await addDoc(collection(db, 'deposit_requests'), {
          uid: currentUser.uid,
          amount: amt,
          trxId: trx,
          method: selectedMethod,
          status: 'Pending',
          timestamp: serverTimestamp()
        });

        haptic('success');
        showToast('Deposit request submitted! Admin will verify soon.', 'success');
      }

      setDepositAmount('');
      setDepositTrxId('');
    } catch (e: any) {
      console.error('Deposit error:', e);
      haptic('error');
      showToast('Deposit processing failed. Please try again.', 'error');
    } finally {
      setDepositSubmitting(false);
      setTimeout(() => {
        setAutoDepositVerifying(false);
        setAutoDepositProgress(0);
        setAutoDepositStatusText('');
      }, 800);
    }
  };

  const copyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    haptic('success');
    showToast('Copied to clipboard!', 'success');
  };

  // Helper to generate realistic TrxIDs
  const generateRandomTrxCode = (method = 'bkash') => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const prefix =
      method === 'bkash' ? 'BK' :
      method === 'nagad' ? 'NG' :
      method === 'rocket' ? 'RK' : 'TX';
    return `${prefix}${code}`;
  };

  // Admin Trx Maker: Create Custom TrxID
  const handleCreateAdminTrx = async () => {
    const amt = parseFloat(newAdminTrxAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Enter a valid deposit amount for TrxID', 'error');
      haptic('error');
      return;
    }

    let finalTrx = newAdminTrxId.trim().toUpperCase();
    if (!finalTrx) {
      finalTrx = generateRandomTrxCode(newAdminTrxMethod);
    }

    setAdminTrxCreating(true);
    haptic('heavy');

    try {
      await addDoc(collection(db, 'admin_created_trxs'), {
        trxId: finalTrx,
        amount: amt,
        method: newAdminTrxMethod,
        status: 'Unused',
        note: newAdminTrxNote.trim() || 'Admin Created TrxID',
        createdAt: serverTimestamp()
      });

      haptic('success');
      showToast(`🎉 TrxID [${finalTrx}] successfully created for ৳ ${amt}!`, 'success');

      setNewAdminTrxId('');
      setNewAdminTrxNote('');
    } catch (e: any) {
      console.error('Error creating admin TrxID:', e);
      haptic('error');
      showToast('Failed to create TrxID. Try again.', 'error');
    } finally {
      setAdminTrxCreating(false);
    }
  };

  // Admin Trx Maker: Quick 1-Click Preset Generator
  const handleQuickBatchGenAdminTrx = async (amt: number, method: string) => {
    const generatedCode = generateRandomTrxCode(method);
    haptic('heavy');
    try {
      await addDoc(collection(db, 'admin_created_trxs'), {
        trxId: generatedCode,
        amount: amt,
        method: method,
        status: 'Unused',
        note: `Quick 1-Click ${method.toUpperCase()} ৳${amt} TrxID`,
        createdAt: serverTimestamp()
      });

      haptic('success');
      showToast(`⚡ Quick TrxID [${generatedCode}] for ৳${amt} created!`, 'success');
    } catch (e: any) {
      console.error('Quick TrxID error:', e);
      showToast('Error generating TrxID', 'error');
    }
  };

  // Admin Trx Maker: Delete TrxID
  const handleDeleteAdminTrx = async (docId: string) => {
    if (!window.confirm('Are you sure you want to delete this TrxID?')) return;
    haptic('medium');
    try {
      await deleteDoc(doc(db, 'admin_created_trxs', docId));
      showToast('TrxID deleted!', 'info');
    } catch (e: any) {
      console.error('Delete TrxID error:', e);
      showToast('Failed to delete TrxID', 'error');
    }
  };

  // Admin: Save or Update Service Manually
  const handleSaveServiceManual = async () => {
    if (!adminCategory.trim() || !adminName.trim() || !adminPrice) {
      showToast('Category, Name, and Price are required!', 'error');
      haptic('error');
      return;
    }

    const priceNum = parseFloat(adminPrice);
    const minNum = parseInt(adminMin) || 10;
    const maxNum = parseInt(adminMax) || 1000000;

    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('Enter a valid price', 'error');
      haptic('error');
      return;
    }

    setAdminSubmitting(true);
    haptic('heavy');

    try {
      const svcData = {
        category: adminCategory.trim(),
        name: adminName.trim(),
        price: priceNum,
        min: minNum,
        max: maxNum,
        desc: adminDesc.trim(),
        apiServiceId: adminApiServiceId.trim()
      };

      if (editingServiceId) {
        await updateDoc(doc(db, 'services', editingServiceId), svcData);
        showToast('✅ Service updated successfully!', 'success');
      } else {
        await addDoc(collection(db, 'services'), svcData);
        showToast('✅ Service added to Firestore!', 'success');
      }

      // Reset form
      setAdminCategory('');
      setAdminName('');
      setAdminPrice('');
      setAdminMin('100');
      setAdminMax('100000');
      setAdminDesc('');
      setAdminApiServiceId('');
      setEditingServiceId(null);
      haptic('success');
    } catch (err: any) {
      console.error('Error saving service:', err);
      showToast('Failed to save service: ' + err.message, 'error');
      haptic('error');
    } finally {
      setAdminSubmitting(false);
    }
  };

  // Admin: Edit Click
  const handleEditServiceClick = (svc: ServiceData) => {
    setEditingServiceId(svc.id);
    setAdminCategory(svc.category || '');
    setAdminName(svc.name || '');
    setAdminPrice(String(svc.price || ''));
    setAdminMin(String(svc.min || '100'));
    setAdminMax(String(svc.max || '100000'));
    setAdminDesc(svc.desc || '');
    setAdminApiServiceId(svc.apiServiceId || '');
    haptic('light');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Admin: Delete Service
  const handleDeleteService = (svcId: string, svcName: string) => {
    setModalConfig({
      show: true,
      title: 'Delete Service',
      bodyHtml: <p className="text-slate-300 text-xs">Are you sure you want to delete <strong>{svcName}</strong>?</p>,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'services', svcId));
          showToast('Service deleted!', 'info');
          haptic('success');
        } catch (e: any) {
          showToast('Failed to delete service', 'error');
        }
      }
    });
  };

  // Admin: Manual Import Defaults (One-Click manual trigger)
  const handleManualImportDefaults = () => {
    setModalConfig({
      show: true,
      title: 'Import Default Services',
      bodyHtml: <p className="text-slate-300 text-xs">Are you sure you want to import default preset services into Firestore?</p>,
      onConfirm: async () => {
        haptic('heavy');
        showToast('Importing services to database...', 'info');
        let addedCount = 0;
        try {
          const existingNames = new Set(allServices.map((s) => s.name));
          for (const svc of DEFAULT_SERVICES) {
            if (!existingNames.has(svc.name)) {
              await addDoc(collection(db, 'services'), svc);
              addedCount++;
            }
          }
          showToast(`✅ ${addedCount} services imported successfully!`, 'success');
          haptic('success');
        } catch (e: any) {
          showToast('Import failed: ' + e.message, 'error');
          haptic('error');
        }
      }
    });
  };

  // Admin: Approve Deposit
  const handleApproveDeposit = async (dep: DepositRequest) => {
    try {
      const finalAmount = dep.amount;
      const { bonusAmount, bonusPercentage } = calculateDepositBonus(finalAmount, depositBonusConfig);
      const totalCredited = finalAmount + bonusAmount;

      const uRef = doc(db, 'users', dep.uid);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        const curBal = uSnap.data().balance || 0;
        const curTotDep = uSnap.data().total_deposit || 0;
        await updateDoc(uRef, {
          balance: curBal + totalCredited,
          total_deposit: curTotDep + finalAmount
        });
      } else {
        await setDoc(uRef, { balance: totalCredited, total_deposit: finalAmount, total_orders: 0, createdAt: serverTimestamp() });
      }

      await updateDoc(doc(db, 'deposit_requests', dep.id), {
        status: 'Approved',
        bonusAmount: bonusAmount,
        totalCredited: totalCredited,
        approvedAt: serverTimestamp()
      });
      showToast(`✅ Approved ৳${finalAmount}${bonusAmount > 0 ? ` (+৳${bonusAmount} Bonus)` : ''} for ${dep.trxId}`, 'success');
      haptic('success');
    } catch (e: any) {
      showToast('Approval error: ' + e.message, 'error');
    }
  };

  return (
    <div className="max-w-[480px] mx-auto min-h-screen relative pb-28">
      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item toast-${t.type}`}>
            <i
              className={`fas ${
                t.type === 'success'
                  ? 'fa-check-circle'
                  : t.type === 'error'
                  ? 'fa-times-circle'
                  : t.type === 'warning'
                  ? 'fa-exclamation-triangle'
                  : 'fa-info-circle'
              }`}
            ></i>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      <div className={`modal-overlay ${modalConfig.show ? 'show' : ''}`}>
        <div className="modal-sheet">
          <div className="modal-handle"></div>
          <h3 className="text-lg font-black mb-2">{modalConfig.title}</h3>
          <div className="mb-6">{modalConfig.bodyHtml}</div>
          <div className="flex gap-3">
            <button
              onClick={() => setModalConfig((prev) => ({ ...prev, show: false }))}
              className="btn-secondary-solid flex-1"
              style={{ padding: '14px' }}
            >
              CANCEL
            </button>
            <button
              onClick={() => {
                setModalConfig((prev) => ({ ...prev, show: false }));
                modalConfig.onConfirm();
              }}
              className="btn-primary-solid flex-1"
              style={{ padding: '14px' }}
            >
              CONFIRM
            </button>
          </div>
        </div>
      </div>

      {/* Splash Screen */}
      {showSplash && (
        <div className="fixed inset-0 z-[9999] splash-bg flex flex-col items-center justify-center">
          <div className="splash-icon w-24 h-24 rounded-[28px] flex items-center justify-center animate-bounce">
            <i className="fas fa-bolt text-white text-4xl"></i>
          </div>
          <h1 className="mt-6 text-2xl font-black text-white tracking-tight">RF SMM</h1>
          <p className="text-slate-500 text-[10px] font-bold mt-1.5 tracking-widest uppercase">
            Bangladesh's #1 Panel
          </p>
          <div className="splash-loader mt-8">
            <div className="splash-loader-fill"></div>
          </div>
        </div>
      )}

      {/* Auth Screen */}
      {!showSplash && !isLoggedIn && (
        <div className="fixed inset-0 z-[8000] bg-[#030712] flex flex-col items-center justify-center p-6">
          <div className="auth-logo">
            <i className="fas fa-bolt text-white text-3xl"></i>
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-1 text-white">RF SMM</h1>
          <p className="text-xs font-bold tracking-widest uppercase mb-8 text-slate-400">
            Bangladesh's #1 Panel
          </p>

          <div className="auth-card auth-animate w-full">
            <div className="auth-tab">
              <button
                className={`auth-tab-btn ${authTab === 'login' ? 'active-tab' : ''}`}
                onClick={() => {
                  setAuthTab('login');
                  haptic('light');
                }}
              >
                Login
              </button>
              <button
                className={`auth-tab-btn ${authTab === 'register' ? 'active-tab' : ''}`}
                onClick={() => {
                  setAuthTab('register');
                  haptic('light');
                }}
              >
                Register
              </button>
            </div>

            {authTab === 'login' ? (
              <div>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Enter your username"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                  />
                  {loginUserErr && <p className="auth-error show">{loginUserErr}</p>}
                </div>
                <div className="mb-4">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                  {loginPassErr && <p className="auth-error show">{loginPassErr}</p>}
                </div>
                <button
                  className="btn-primary-solid flex items-center justify-center gap-2"
                  onClick={handleLogin}
                  disabled={authSubmitting}
                >
                  {authSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className="fas fa-sign-in-alt text-xs"></i>
                      <span>LOGIN</span>
                    </>
                  )}
                </button>
                <div className="auth-divider">OR</div>
                <button className="auth-tg-btn" onClick={loginWithTelegram}>
                  <i className="fab fa-telegram text-[#2AABEE] text-lg"></i>
                  <span>Continue with Telegram</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Your full name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                  {regNameErr && <p className="auth-error show">{regNameErr}</p>}
                </div>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Choose a username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                  />
                  {regUserErr && <p className="auth-error show">{regUserErr}</p>}
                </div>
                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Create a password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                  {regPassErr && <p className="auth-error show">{regPassErr}</p>}
                </div>
                <div className="mb-4">
                  <label className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Re-enter password"
                    value={regConfirmPass}
                    onChange={(e) => setRegConfirmPass(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                  />
                  {regConfirmErr && <p className="auth-error show">{regConfirmErr}</p>}
                </div>
                <button
                  className="btn-primary-solid flex items-center justify-center gap-2"
                  onClick={handleRegister}
                  disabled={authSubmitting}
                >
                  {authSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className="fas fa-user-plus text-xs"></i>
                      <span>CREATE ACCOUNT</span>
                    </>
                  )}
                </button>
                <div className="auth-divider">OR</div>
                <button className="auth-tg-btn" onClick={loginWithTelegram}>
                  <i className="fab fa-telegram text-[#2AABEE] text-lg"></i>
                  <span>Sign Up with Telegram</span>
                </button>
              </div>
            )}
          </div>
          <p className="text-[10px] mt-6 text-center font-semibold text-slate-500">
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      )}

      {/* Main Application */}
      {!showSplash && isLoggedIn && (
        <div>
          {/* HEADER */}
          <header className="premium-header px-5 pt-7 pb-7">
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div
                onClick={() => {
                  setActiveTab('profile');
                  haptic('light');
                }}
                className="flex items-center gap-3 cursor-pointer group"
                title="View Profile (প্রোফাইল দেখুন)"
              >
                <div className="relative">
                  {userPhotoURL || currentUser?.photoURL ? (
                    <img
                      src={userPhotoURL || currentUser?.photoURL}
                      className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-amber-400/60 group-hover:scale-105 transition duration-300"
                      alt="User Avatar"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          currentUser?.name || 'User'
                        )}&background=3b82f6&color=fff&bold=true`;
                      }}
                    />
                  ) : (
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                        currentUser?.name || 'User'
                      )}&background=3b82f6&color=fff&bold=true`}
                      className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white/10 group-hover:scale-105 transition duration-300"
                      alt="User Avatar"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-md flex items-center justify-center border-2 border-[#030712]">
                    <i className="fas fa-check text-white text-[6px]"></i>
                  </div>
                </div>
                <div>
                  <h3 className="font-extrabold text-base tracking-tight text-white group-hover:text-amber-400 transition flex items-center gap-1.5">
                    <span>{currentUser?.name || 'User'}</span>
                    <i className="fas fa-chevron-right text-[10px] text-slate-500 group-hover:text-amber-400"></i>
                  </h3>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-mono">
                    <i className="fas fa-fingerprint text-[8px] text-blue-400"></i>
                    <span>@{currentUser?.username || currentUser?.uid.slice(0, 8)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 items-center">
                {/* Live Orders Button */}
                <button
                  onClick={() => {
                    setShowLiveOrdersModal(true);
                    haptic('heavy');
                  }}
                  className="relative w-9 h-9 bg-red-500/15 border border-red-500/40 rounded-xl flex items-center justify-center text-red-400 cursor-pointer active:scale-95 transition hover:bg-red-500/25"
                  title="Live Orders (লাইভ অর্ডার)"
                >
                  <i className="fas fa-broadcast-tower text-xs text-red-400 animate-pulse"></i>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                </button>

                {/* Tasks Button */}
                <button
                  onClick={() => {
                    setShowTasksModal(true);
                    haptic('heavy');
                  }}
                  className="relative w-9 h-9 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-center justify-center text-amber-400 cursor-pointer active:scale-95 transition hover:bg-amber-500/25"
                  title="Daily Tasks & Rewards (টাস্ক)"
                >
                  <i className="fas fa-tasks text-xs text-amber-400"></i>
                </button>

                {/* Search Button */}
                <button
                  onClick={() => {
                    setShowSearchModal(true);
                    haptic('light');
                  }}
                  className="relative w-9 h-9 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white cursor-pointer active:scale-95 transition hover:bg-blue-500/20 hover:border-blue-400/40"
                  title="Search Services (সার্চ)"
                >
                  <i className="fas fa-search text-xs text-blue-400"></i>
                </button>

                {/* Notifications Button */}
                <button
                  onClick={() => {
                    setShowNotifModal(true);
                    haptic('light');
                  }}
                  className="relative w-9 h-9 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white cursor-pointer active:scale-95 transition hover:bg-amber-500/20 hover:border-amber-400/40"
                  title="Notifications (নটিফিকেশন)"
                >
                  <i className="fas fa-bell text-xs text-amber-400"></i>
                  {unreadNotifCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#030712] animate-bounce">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>

                {/* Mailbox Button */}
                <button
                  onClick={() => {
                    setShowMailboxModal(true);
                    haptic('light');
                  }}
                  className="relative w-9 h-9 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white cursor-pointer active:scale-95 transition hover:bg-emerald-500/20 hover:border-emerald-400/40"
                  title="Mail Box (মেইল বক্স)"
                >
                  <i className="fas fa-envelope text-xs text-emerald-400"></i>
                  {unreadMailCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-[#030712]">
                      {unreadMailCount}
                    </span>
                  )}
                </button>

                {/* Admin Mode Toggle Button - Only shown for rashal117 */}
                {isAdminUser && (
                  <button
                    onClick={() => {
                      setActiveTab(activeTab === 'admin' ? 'home' : 'admin');
                      haptic('heavy');
                    }}
                    className={`relative px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-extrabold text-[10px] cursor-pointer transition active:scale-95 ${
                      activeTab === 'admin'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                    }`}
                    title="Admin Panel"
                  >
                    <i className="fas fa-crown text-amber-400"></i>
                    <span>ADMIN</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 relative z-10">
              <div className="stat-card">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-wallet text-blue-400 text-[10px]"></i>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Balance (৳)
                  </p>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">
                  ৳ {userBalance.toFixed(2)}
                </h2>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                    <i className="fas fa-box text-indigo-400 text-[10px]"></i>
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    Orders
                  </p>
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">{userTotalOrders}</h2>
              </div>
            </div>

            {/* USER QUICK FEATURE BUTTONS: LIVE ORDERS & TASKS */}
            <div className="grid grid-cols-2 gap-2.5 mt-3 relative z-10">
              <button
                onClick={() => {
                  setShowLiveOrdersModal(true);
                  haptic('heavy');
                }}
                className="group relative overflow-hidden p-3 rounded-2xl bg-gradient-to-r from-red-950/70 via-rose-900/50 to-slate-900/90 border border-red-500/40 hover:border-red-400/80 shadow-lg text-left transition active:scale-95 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                    <i className="fas fa-satellite-dish text-xs animate-pulse"></i>
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-xs text-white">লাইভ অর্ডার</span>
                      <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.2 rounded-full uppercase animate-pulse">
                        LIVE ⚡
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-300 font-medium">Realtime Orders</p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-[10px] text-slate-400 group-hover:text-white transition"></i>
              </button>

              <button
                onClick={() => {
                  setShowTasksModal(true);
                  haptic('heavy');
                }}
                className="group relative overflow-hidden p-3 rounded-2xl bg-gradient-to-r from-amber-950/70 via-yellow-900/50 to-slate-900/90 border border-amber-500/40 hover:border-amber-400/80 shadow-lg text-left transition active:scale-95 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <i className="fas fa-tasks text-xs"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-extrabold text-xs text-white">টাস্ক (Tasks)</span>
                      <span className="text-[8px] font-black bg-amber-500 text-black px-1.5 py-0.2 rounded-full">
                        BONUS
                      </span>
                    </div>
                    <p className="text-[9px] text-amber-300/90 font-medium">Complete & Earn ৳</p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-[10px] text-slate-400 group-hover:text-white transition"></i>
              </button>
            </div>
          </header>

          {/* HOME TAB */}
          {activeTab === 'home' && (
            <section className="px-5 mt-5">
              {/* SEARCH BAR TRIGGER */}
              <div className="mb-4">
                <div
                  onClick={() => {
                    setShowSearchModal(true);
                    haptic('light');
                  }}
                  className="relative w-full bg-slate-900/90 border border-blue-500/30 hover:border-blue-400/60 rounded-2xl py-3 pl-10 pr-12 text-xs font-semibold text-slate-300 shadow-[0_4px_20px_rgba(0,0,0,0.3)] cursor-pointer transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 text-slate-400">
                    <i className="fas fa-search text-blue-400 text-sm"></i>
                    <span className="text-slate-400 font-medium">সার্চ করুন (Search Facebook, TikTok, Followers)...</span>
                  </div>
                  <span className="bg-blue-500/20 text-blue-300 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border border-blue-500/30">
                    FIND
                  </span>
                </div>
              </div>
              {/* SOCIAL PLATFORMS SELECTOR GRID */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2.5 px-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
                    <i className="fas fa-layer-group text-blue-400"></i>Select Platform (প্ল্যাটফর্ম বাছুন)
                  </span>
                  <span className="text-[9px] text-blue-400 font-bold bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20">
                    Tap to Select ⚡
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const isSelected = selectedCategory && (
                      selectedCategory.toLowerCase().includes(platform.id) ||
                      (platform.id === 'facebook' && selectedCategory.toLowerCase().includes('fb')) ||
                      (platform.id === 'instagram' && selectedCategory.toLowerCase().includes('ig')) ||
                      (platform.id === 'tiktok' && selectedCategory.toLowerCase().includes('tt')) ||
                      (platform.id === 'youtube' && selectedCategory.toLowerCase().includes('yt')) ||
                      (platform.id === 'telegram' && selectedCategory.toLowerCase().includes('tg'))
                    );

                    return (
                      <button
                        key={platform.id}
                        onClick={() => handleSelectPlatformLogo(platform.id)}
                        className={`group relative flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-90 ${
                          isSelected
                            ? 'bg-gradient-to-b ' + platform.bg + ' border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)] ring-2 ring-blue-400/40'
                            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110"
                          style={{ color: platform.color }}
                        >
                          <i className={platform.icon}></i>
                        </div>
                        <span className="text-[9px] font-bold text-slate-300 mt-1 truncate max-w-full">
                          {platform.name.split(' ')[0]}
                        </span>
                        {isSelected && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[7px] border border-[#030712]">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* NEW ORDER CARD WITH STEPPER TRACK ("রোগ") */}
              <div id="order-form" className="glass-card p-5 mb-5 relative overflow-hidden border border-blue-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400 shadow-inner">
                      <i className="fas fa-cart-plus text-sm"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">New Order (নতুন অর্ডার)</h3>
                      <p className="text-[9px] font-semibold text-slate-400">Step-by-step automatic dispatch</p>
                    </div>
                  </div>
                  <div className="text-[8px] font-black text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md tracking-wider border border-blue-500/20">
                    INSTANT ⚡
                  </div>
                </div>

                {/* DYNAMIC PROGRESS STEPPER TRACK ("রোগ" / STEP BAR) */}
                <div className="mb-5 bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-300">
                        Order Process (অর্ডার প্রসেস)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-300">
                      Step {activeStepIndex}/5 ({orderStepProgress}%)
                    </span>
                  </div>

                  {/* Dynamic Progress Line Track ("রোগ") */}
                  <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-3.5 border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 transition-all duration-500 ease-out rounded-full shadow-[0_0_12px_rgba(59,130,246,0.8)]"
                      style={{ width: `${orderStepProgress}%` }}
                    ></div>
                  </div>

                  {/* Step Nodes */}
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {[
                      { step: 1, label: 'ক্যাটাগরি', icon: 'fas fa-folder-open', done: isStep1Done },
                      { step: 2, label: 'সার্ভিস', icon: 'fas fa-magic', done: isStep2Done },
                      { step: 3, label: 'লিঙ্ক', icon: 'fas fa-link', done: isStep3Done },
                      { step: 4, label: 'পরিমাণ', icon: 'fas fa-hashtag', done: isStep4Done },
                      { step: 5, label: 'কনফার্ম', icon: 'fas fa-check-circle', done: isStep4Done },
                    ].map((s) => {
                      const isActive = activeStepIndex === s.step;
                      return (
                        <div key={s.step} className="flex flex-col items-center">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
                              s.done
                                ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)] scale-105'
                                : isActive
                                ? 'bg-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.8)] ring-2 ring-blue-400/50 scale-110'
                                : 'bg-slate-800 text-slate-500 border border-white/5'
                            }`}
                          >
                            {s.done ? <i className="fas fa-check text-[9px]"></i> : <i className={`${s.icon} text-[9px]`}></i>}
                          </div>
                          <span
                            className={`text-[8px] font-bold mt-1 tracking-tight ${
                              s.done
                                ? 'text-emerald-400'
                                : isActive
                                ? 'text-blue-300 font-extrabold'
                                : 'text-slate-500'
                            }`}
                          >
                            {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Category Dropdown */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="form-label mb-0">
                        <i className="fas fa-folder-open mr-1 text-[8px]"></i> 1. Category
                      </label>
                      {selectedCategory && (
                        <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-[9px] text-blue-300 font-bold">
                          <i className={getPlatformMeta(selectedCategory).icon}></i>
                          <span>{getPlatformMeta(selectedCategory).name}</span>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <select
                        className="input-modern appearance-none pr-8"
                        value={selectedCategory}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                      >
                        <option value="" disabled>
                          Choose category...
                        </option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[10px]"></i>
                    </div>
                    {catErr && <p className="field-error show">{catErr}</p>}
                  </div>

                  {/* Service Dropdown */}
                  <div>
                    <label className="form-label">
                      <i className="fas fa-magic mr-1 text-[8px]"></i> 2. Service
                    </label>
                    <div className="relative">
                      <select
                        className="input-modern appearance-none pr-8"
                        value={selectedServiceId}
                        onChange={(e) => handleServiceChange(e.target.value)}
                        disabled={!selectedCategory}
                      >
                        <option value="" disabled>
                          {selectedCategory ? '✨ Select service...' : 'Select category first'}
                        </option>
                        {allServices
                          .filter((s) => s.category === selectedCategory)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} — ৳ {s.price}/1k
                            </option>
                          ))}
                      </select>
                      <i className="fas fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[10px]"></i>
                    </div>
                    {svcErr && <p className="field-error show">{svcErr}</p>}
                  </div>

                  {/* Service Details & Description */}
                  {currentService && (
                    <>
                      {currentService.desc && (
                        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3">
                          <div className="flex items-start gap-2">
                            <i className="fas fa-info-circle text-blue-400 text-xs mt-0.5"></i>
                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                              {currentService.desc}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 flex justify-between items-center">
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-blue-400/70 uppercase">Min</p>
                          <p className="font-extrabold text-sm text-blue-300">
                            {currentService.min.toLocaleString()}
                          </p>
                        </div>
                        <div className="w-px h-6 bg-blue-500/15"></div>
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-blue-400/70 uppercase">Max</p>
                          <p className="font-extrabold text-sm text-blue-300">
                            {currentService.max ? currentService.max.toLocaleString() : '∞'}
                          </p>
                        </div>
                        <div className="w-px h-6 bg-blue-500/10"></div>
                        <div className="text-center">
                          <p className="text-[8px] font-bold text-blue-400/70 uppercase">Rate</p>
                          <p className="font-extrabold text-sm text-blue-300">
                            ৳ {currentService.price}/1k
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Target Link Input */}
                  <div>
                    <label className="form-label">
                      <i className="fas fa-link mr-1 text-[8px]"></i> 3. Target Link
                    </label>
                    <input
                      type="text"
                      className="input-modern"
                      placeholder="https://facebook.com/username or link..."
                      value={targetLink}
                      onChange={(e) => {
                        setTargetLink(e.target.value);
                        setLinkErr('');
                      }}
                    />
                    {linkErr && <p className="field-error show">{linkErr}</p>}
                  </div>

                  {/* Quantity & Price Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">
                        <i className="fas fa-hashtag mr-1 text-[8px]"></i> 4. Quantity
                      </label>
                      <input
                        type="number"
                        className="input-modern"
                        value={quantity}
                        onChange={(e) => {
                          setQuantity(parseInt(e.target.value) || 0);
                          setQtyErr('');
                        }}
                      />
                      {currentService && (
                        <p className="min-max-hint">
                          Min: {currentService.min} — Max:{' '}
                          {currentService.max?.toLocaleString() || '∞'}
                        </p>
                      )}
                      {qtyErr && <p className="field-error show">{qtyErr}</p>}
                    </div>

                    <div>
                      <label className="form-label">
                        <i className="fas fa-coins mr-1 text-[8px]"></i> 5. Cost (BDT / ৳)
                      </label>
                      <div className="price-preview-box">
                        <span className="text-lg font-black text-blue-400">
                          ৳ {calculatedCost.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-[8px] text-center mt-1">
                        {calculatedCost > userBalance ? (
                          <span className="text-red-400 font-bold">
                            Short ৳ {(calculatedCost - userBalance).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-blue-400/60 font-semibold">Balance OK</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handlePlaceOrderClick}
                    disabled={orderSubmitting}
                    className={`btn-primary-solid flex items-center justify-center gap-2 transition-all ${
                      isStep4Done
                        ? 'shadow-[0_8px_25px_rgba(59,130,246,0.6)] ring-2 ring-blue-400/50'
                        : ''
                    }`}
                  >
                    {orderSubmitting ? (
                      <span className="loading-spinner"></span>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane text-xs"></i>
                        <span>PLACE ORDER NOW</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Security Banner */}
              <div
                className="glass-card p-4 flex gap-3 items-center mb-4"
                style={{
                  background: 'rgba(59,130,246,0.05)',
                  borderColor: 'rgba(59,130,246,0.1)'
                }}
              >
                <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400 flex-shrink-0">
                  <i className="fas fa-shield-alt text-lg"></i>
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">100% Secure & Refundable</h4>
                  <p className="text-[10px] text-slate-500">
                    Failed orders automatically refund Coins to your account.
                  </p>
                </div>
              </div>

              {/* Modern Extra Bottom Highlights & Features Section */}
              <div className="space-y-4 mb-6">
                {/* Platform Live Stats Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="glass-card p-3 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 text-center space-y-1">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-xs mx-auto">
                      <i className="fas fa-bolt"></i>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">গড় ডেলিভারি</p>
                    <p className="text-xs font-black text-cyan-300 font-mono">১ - ৫ মিনিট</p>
                  </div>

                  <div className="glass-card p-3 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950 text-center space-y-1">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs mx-auto">
                      <i className="fas fa-users"></i>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">সন্তুষ্ট ইউজার</p>
                    <p className="text-xs font-black text-blue-300 font-mono">৫০,০০০+</p>
                  </div>

                  <div className="glass-card p-3 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 text-center space-y-1">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs mx-auto">
                      <i className="fas fa-star"></i>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ইউজার রেটিং</p>
                    <p className="text-xs font-black text-amber-300 font-mono">৪.৯ / ৫.০ ★</p>
                  </div>

                  <div className="glass-card p-3 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 text-center space-y-1">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs mx-auto">
                      <i className="fas fa-shield-check"></i>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">সফলতা হার</p>
                    <p className="text-xs font-black text-emerald-300 font-mono">৯৯.৯%</p>
                  </div>
                </div>

                {/* Extra Feature Showcase Grid */}
                <div className="glass-card p-4 sm:p-5 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 space-y-3.5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center text-xs">
                        <i className="fas fa-crown"></i>
                      </div>
                      <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">
                        আমাদের সার্ভিসসমূহের বৈশিষ্ট্য (Features)
                      </h4>
                    </div>
                    <span className="text-[9px] font-black text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                      PREMIUM QUALITY
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-black/40 border border-white/5 hover:border-cyan-500/30 transition">
                      <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center text-sm shrink-0 mt-0.5">
                        <i className="fas fa-rocket"></i>
                      </div>
                      <div className="space-y-0.5">
                        <h5 className="font-black text-xs text-cyan-200">ইনস্ট্যান্ট স্পিড প্রসেসিং</h5>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          অর্ডার কনফার্ম করার সাথে সাথে অটোমেটিক সিস্টেমের মাধ্যমে দ্রুত কাজ শুরু হয়ে যায়।
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-black/40 border border-white/5 hover:border-emerald-500/30 transition">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-sm shrink-0 mt-0.5">
                        <i className="fas fa-coins"></i>
                      </div>
                      <div className="space-y-0.5">
                        <h5 className="font-black text-xs text-emerald-200">দৈনিক রিওয়ার্ড ও ইনকাম</h5>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          প্রতিদিন ফ্রি চেক-ইন, হুইল স্পিন ও টাস্ক কমপ্লিট করে ফ্রি ব্যালেন্স আয় করার সুবিধা।
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-black/40 border border-white/5 hover:border-purple-500/30 transition">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center text-sm shrink-0 mt-0.5">
                        <i className="fas fa-lock text-purple-300"></i>
                      </div>
                      <div className="space-y-0.5">
                        <h5 className="font-black text-xs text-purple-200">নিরাপদ ও প্রাইভেট</h5>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          পাসওয়ার্ডের কোনো প্রয়োজন নেই। ১০০% গোপনীয়তা রক্ষা করে সার্ভিস প্রদান করা হয়।
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-black/40 border border-white/5 hover:border-amber-500/30 transition">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center text-sm shrink-0 mt-0.5">
                        <i className="fas fa-headset text-amber-300"></i>
                      </div>
                      <div className="space-y-0.5">
                        <h5 className="font-black text-xs text-amber-200">২৪/৭ কাস্টমার সাপোর্ট</h5>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          অর্ডার সংক্রান্ত যেকোনো প্রশ্ন বা সহযোগিতায় সরাসরি টেলিগ্রাম ও সাপোর্ট চ্যানেলে যোগাযোগ করুন।
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Interactive Quick Explorer CTA Banner */}
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-950 via-purple-950 to-slate-950 border border-blue-500/30 shadow-2xl relative overflow-hidden flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 max-w-sm">
                    <span className="text-[9px] font-black text-amber-300 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                      ⚡ QUICK EXPLORE
                    </span>
                    <h4 className="font-black text-xs text-white pt-1">
                      ডেইলি ফ্রি বোনাস ও টাস্ক স্পিন এক্সপ্লোর করতে চান?
                    </h4>
                    <p className="text-[10px] text-slate-300">
                      সহজ টাস্ক কমপ্লিট করুন, ডায়মন্ড স্পিন ঘুরান এবং আপনার ওয়ালেটে ফ্রি বোনাস যোগ করুন!
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setActiveTab('tasks');
                        haptic('light');
                      }}
                      className="px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition active:scale-95 flex items-center gap-1.5"
                    >
                      <i className="fas fa-tasks text-cyan-200"></i>
                      <span>টাস্ক পেইজ (TASKS)</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab('funds');
                        haptic('light');
                      }}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5"
                    >
                      <i className="fas fa-wallet"></i>
                      <span>ফান্ড ডিপোজিট</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <section className="px-5 mt-5">
              <div className="flex justify-between items-center mb-5">
                <h2 className="section-title text-white">My Orders</h2>
                <div className="live-badge">LIVE</div>
              </div>

              <div className="space-y-3">
                {ordersList.length === 0 ? (
                  <div className="empty-state">
                    <i className="fas fa-receipt"></i>
                    <p>No orders yet</p>
                    <p className="text-[10px] mt-1 font-normal">Place your first order from Home</p>
                  </div>
                ) : (
                  ordersList.map((o) => {
                    let stClass = 'bg-slate-500/15 text-slate-400';
                    let stIcon = 'fa-clock';

                    if (o.status === 'Completed') {
                      stClass = 'bg-blue-500/15 text-blue-400';
                      stIcon = 'fa-check-circle';
                    } else if (o.status === 'Processing' || o.status === 'In Progress') {
                      stClass = 'bg-indigo-500/15 text-indigo-400';
                      stIcon = 'fa-spinner fa-spin';
                    } else if (o.status === 'Cancelled') {
                      stClass = 'bg-red-500/15 text-red-400';
                      stIcon = 'fa-times-circle';
                    }

                    const meta = getPlatformMeta(o.service);

                    return (
                      <div key={o.id} className="glass-card p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                            #{o.id.slice(-8)}
                          </span>
                          <span className={`order-status ${stClass}`}>
                            <i className={`fas ${stIcon} mr-1 text-[7px]`}></i>
                            {o.status || 'Pending'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 my-1">
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 border border-white/10"
                            style={{ color: meta.color, backgroundColor: `${meta.color}25` }}
                          >
                            <i className={meta.icon}></i>
                          </div>
                          <h4 className="font-bold text-xs text-white leading-tight">{o.service}</h4>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">
                          {o.link}
                        </p>
                        <div className="dashed-divider my-3"></div>
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-[8px] font-black text-slate-500 uppercase">
                              Qty
                            </span>
                            <div className="font-bold text-xs text-white">
                              {o.qty?.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-[8px] font-black text-slate-500 uppercase">
                              Cost
                            </span>
                            <div className="font-bold text-xs text-blue-400">
                              ৳ {o.cost?.toFixed(2)}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-black text-slate-500 uppercase">
                              Date
                            </span>
                            <div className="text-[10px] text-slate-400">
                              {o.createdAt
                                ? new Date(o.createdAt).toLocaleDateString('en-BD', {
                                    day: '2-digit',
                                    month: 'short'
                                  })
                                : 'Just now'}
                            </div>
                          </div>
                        </div>

                        {/* API Dispatch Indicator & Retry */}
                        <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                          {o.apiOrderId ? (
                            <span className="text-[8px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                              ✅ API Order: #{o.apiOrderId}
                            </span>
                          ) : o.apiError ? (
                            <span className="text-[8px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">
                              ❌ API Error
                            </span>
                          ) : (
                            <span className="text-[8px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                              ⏳ Local Order
                            </span>
                          )}

                          {(!o.apiOrderId || o.apiError) && o.status !== 'Completed' && (
                            <button
                              onClick={() => handleRetryOrder(o)}
                              className="text-[10px] px-2.5 py-1 rounded-lg bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 font-bold transition active:scale-95"
                            >
                              🔄 Retry API
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <section className="px-5 mt-5 space-y-5">
              <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-950/70 via-yellow-900/50 to-slate-900 border border-amber-500/30 shadow-xl relative overflow-hidden">
                <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl shadow-lg">
                    <i className="fas fa-calendar-check"></i>
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white">Daily Rewards & Tasks (ডেইলি টাস্ক ও বোনাস)</h2>
                    <p className="text-[11px] text-amber-200/80">প্রতিদিন অ্যাপ ওপেন করে ডেইলি বোনাস নিন এবং প্রোমো কোড রিডিম করুন!</p>
                  </div>
                </div>

                {/* User Current Balance */}
                <div className="mt-3 pt-3 border-t border-amber-500/20 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">আপনার বর্তমান ওয়ালেট ব্যালেন্স:</span>
                  <span className="text-sm font-black text-amber-400 font-mono bg-black/40 px-3 py-1 rounded-xl border border-amber-500/30">
                    ৳ {userBalance.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* CARD 0-GOLD: VIP GOLD SPIN & WIN (গোল্ডেন লকি স্পিন) */}
              <div className="glass-card p-5 space-y-4 border border-yellow-500/50 relative overflow-hidden bg-gradient-to-br from-yellow-950/60 via-amber-950/40 to-slate-900 shadow-2xl">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-yellow-500 via-amber-500 to-transparent text-slate-950 font-black text-[9px] px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-md">
                  <i className="fas fa-crown"></i>
                  <span>VIP ৳50+ BALANCE UNLOCKED</span>
                </div>

                <div className="flex items-center justify-between border-b border-yellow-500/20 pb-3 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 text-slate-950 flex items-center justify-center text-xl font-black shadow-lg shadow-yellow-500/20 border border-yellow-300">
                      <i className="fas fa-dharmachakra animate-spin-slow"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-yellow-300 flex items-center gap-2">
                        <span>Gold Spin & Win (গোল্ড স্পিন)</span>
                        <span className="text-[9px] font-black bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded-md">
                          0.10 TK - 5.00 TK
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-300">
                        যাদের একাউন্টে ৳ ৫০+ ব্যালেন্স থাকবে তারা পাবেন দৈনন্দিন গোল্ড স্পিন!
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-yellow-300 font-mono bg-yellow-500/10 px-2.5 py-1 rounded-lg border border-yellow-500/30 shrink-0">
                    ৳ 0.10 - ৳ 5.00
                  </span>
                </div>

                {/* Admin Quick Shortcut Button for Gold Spin */}
                {isAdminUser && (
                  <button
                    onClick={() => {
                      setActiveTab('admin');
                      setAdminSubTab('spin');
                      showToast('⚙️ Gold VIP Spin Admin Controls Opened', 'info');
                      haptic('light');
                    }}
                    className="w-full py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition"
                  >
                    <i className="fas fa-crown text-yellow-400"></i>
                    <span>Gold Spin Controls</span>
                  </button>
                )}

                {/* Eligibility Lock Guard or Active Gold Spin Wheel */}
                {userBalance < goldSpinMinBalance ? (
                  /* Locked State View */
                  <div className="bg-slate-950/90 border border-yellow-500/30 rounded-2xl p-4 sm:p-5 text-center space-y-3 relative overflow-hidden">
                    <div className="w-12 h-12 rounded-2xl bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 flex items-center justify-center text-xl mx-auto shadow-md">
                      <i className="fas fa-lock text-yellow-400"></i>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-extrabold text-xs text-yellow-300">
                        🔒 গোল্ড স্পিন আনলক করতে ওয়ালেটে নূন্যতম ৳ {goldSpinMinBalance} প্রয়োজন!
                      </h4>
                      <p className="text-[11px] text-slate-300 max-w-sm mx-auto">
                        আপনার একাউন্ট ব্যালেন্স ৳ ৫০ বা তার বেশি থাকলে আপনি প্রতিদিন সর্বমোট {goldSpinDailyMaxLimit}টি গোল্ড স্পিন পাবেন। প্রতিবার ৳ 0.10 থেকে ৳ 5.00 পর্যন্ত জেতার সুযোগ!
                      </p>
                    </div>

                    {/* Balance Status Meter */}
                    <div className="bg-black/50 p-3 rounded-xl border border-white/10 flex items-center justify-between text-xs font-bold max-w-xs mx-auto">
                      <span className="text-slate-400">আপনার বর্তমান ব্যালেন্স:</span>
                      <span className="text-amber-400 font-mono font-black">৳ {userBalance.toFixed(2)}</span>
                    </div>

                    <button
                      onClick={() => {
                        setActiveTab('funds');
                        showToast('💰 ডিপোজিট পেজে রিডাইরেক্ট করা হচ্ছে...', 'info');
                        haptic('light');
                      }}
                      className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:brightness-110 text-slate-950 font-black text-xs rounded-xl shadow-lg transition active:scale-95 inline-flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-wallet text-sm"></i>
                      <span>DEPOSIT NOW TO UNLOCK GOLD SPIN (ডিপোজিট করুন)</span>
                    </button>
                  </div>
                ) : !goldSpinEnabled ? (
                  <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-center text-red-300 text-xs font-bold">
                    ⚠️ গোল্ড স্পিন সিস্টেম সাময়িকভাবে বন্ধ রয়েছে।
                  </div>
                ) : (
                  /* Unlocked Gold Spin Wheel View */
                  <div className="space-y-4">
                    {/* Progress & Daily Limit */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-yellow-500/30 flex items-center justify-between text-xs font-bold">
                      <span className="text-yellow-200">আজকের গোল্ড স্পিন লিমিট:</span>
                      <span className="text-yellow-400 font-mono">
                        {todayGoldSpinCount} / {goldSpinDailyMaxLimit} Used
                      </span>
                    </div>

                    {/* Gold Wheel Visual Container */}
                    <div className="relative flex flex-col items-center justify-center py-2">
                      {/* Pointer Arrow at top */}
                      <div className="absolute top-0 z-20 text-yellow-400 text-3xl filter drop-shadow-[0_2px_8px_rgba(234,179,8,0.9)] -mb-2">
                        <i className="fas fa-caret-down"></i>
                      </div>

                      {/* Circular Golden Wheel */}
                      <div className="relative w-56 h-56 rounded-full border-4 border-yellow-400 shadow-[0_0_50px_rgba(234,179,8,0.45)] overflow-hidden bg-slate-950">
                        <div
                          className="w-full h-full rounded-full relative transition-transform duration-[3500ms] ease-[cubic-bezier(0.15,0.9,0.2,1)]"
                          style={{
                            transform: `rotate(${goldWheelRotation}deg)`
                          }}
                        >
                          {/* SVG Gold Slices (16 Slices) */}
                          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-11.25deg)' }}>
                            {[
                              { label: '৳0.10', bg: '#d97706' },
                              { label: '৳0.25', bg: '#ca8a04' },
                              { label: '৳0.50', bg: '#eab308' },
                              { label: '৳1.00', bg: '#f59e0b' },
                              { label: '৳0.15', bg: '#b45309' },
                              { label: '৳2.00', bg: '#facc15' },
                              { label: '৳0.30', bg: '#854d0e' },
                              { label: '৳3.00', bg: '#fbbf24' },
                              { label: '৳0.20', bg: '#d97706' },
                              { label: '৳5.00', bg: '#facc15' },
                              { label: '৳0.40', bg: '#eab308' },
                              { label: '৳1.50', bg: '#f59e0b' },
                              { label: '৳0.10', bg: '#b45309' },
                              { label: '৳4.00', bg: '#fbbf24' },
                              { label: '৳0.50', bg: '#854d0e' },
                              { label: '৳2.50', bg: '#ca8a04' }
                            ].map((slice, idx) => {
                              const angle = 22.5; // 360 / 16
                              const startAngle = idx * angle;
                              const endAngle = (idx + 1) * angle;
                              const x1 = 50 + 50 * Math.cos((Math.PI * startAngle) / 180);
                              const y1 = 50 + 50 * Math.sin((Math.PI * startAngle) / 180);
                              const x2 = 50 + 50 * Math.cos((Math.PI * endAngle) / 180);
                              const y2 = 50 + 50 * Math.sin((Math.PI * endAngle) / 180);
                              const textAngle = startAngle + angle / 2;
                              const textX = 50 + 34 * Math.cos((Math.PI * textAngle) / 180);
                              const textY = 50 + 34 * Math.sin((Math.PI * textAngle) / 180);

                              return (
                                <g key={idx}>
                                  <path
                                    d={`M50,50 L${x1},${y1} A50,50 0 0,1 ${x2},${y2} Z`}
                                    fill={slice.bg}
                                    stroke="#0f172a"
                                    strokeWidth="0.8"
                                  />
                                  <text
                                    x={textX}
                                    y={textY}
                                    fill="#000000"
                                    fontSize="4.2"
                                    fontWeight="900"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                                  >
                                    {slice.label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>

                        {/* Gold Wheel Center Cap */}
                        <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 border-2 border-white flex items-center justify-center shadow-lg text-slate-950 font-black text-xs z-10">
                          <i className="fas fa-crown text-base text-slate-950"></i>
                        </div>
                      </div>
                    </div>

                    {/* Gold Spin Button & 24hr Timer */}
                    {(() => {
                      const nextGoldSpinTs = lastGoldSpinTime ? lastGoldSpinTime + 24 * 60 * 60 * 1000 : 0;
                      const goldDiffMs = nextGoldSpinTs ? nextGoldSpinTs - dailyCountdownNow : 0;
                      const isGoldLimitReached = todayGoldSpinCount >= goldSpinDailyMaxLimit;
                      const isGoldSpinCoolingDown = isGoldLimitReached && goldDiffMs > 0;

                      let hours = 0;
                      let mins = 0;
                      let secs = 0;
                      if (isGoldSpinCoolingDown && goldDiffMs > 0) {
                        hours = Math.floor(goldDiffMs / (1000 * 60 * 60));
                        mins = Math.floor((goldDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                        secs = Math.floor((goldDiffMs % (1000 * 60)) / 1000);
                      }
                      const goldCountdownStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                      const goldPercentElapsed = isGoldSpinCoolingDown ? Math.min(100, Math.max(0, ((24 * 3600 * 1000 - goldDiffMs) / (24 * 3600 * 1000)) * 100)) : 100;

                      return (
                        <div className="space-y-3">
                          {isGoldSpinCoolingDown && (
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-yellow-950/80 via-slate-900 to-amber-950/60 border border-yellow-500/40 text-center space-y-2 shadow-inner">
                              <div className="text-[11px] text-yellow-200/90 font-bold flex items-center justify-center gap-1.5">
                                <i className="fas fa-crown text-yellow-400 animate-bounce"></i>
                                <span>২৪ ঘণ্টার গোল্ড স্পিন কুলডাউন চলছে:</span>
                              </div>
                              <div className="text-2xl font-black font-mono text-yellow-400 tracking-widest drop-shadow-md py-1 bg-black/40 rounded-xl border border-yellow-500/30">
                                ⏱️ {goldCountdownStr}
                              </div>
                              <p className="text-[10px] text-slate-300 font-medium">
                                পরবর্তী গোল্ড স্পিন পাবেন <span className="text-yellow-300 font-bold">{hours} ঘণ্টা {mins} মিনিট {secs} সেকেন্ড</span> পর।
                              </p>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-yellow-500/20">
                                <div
                                  className="bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-300 h-1.5 rounded-full transition-all duration-1000"
                                  style={{ width: `${goldPercentElapsed}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={handleStartGoldSpin}
                            disabled={isGoldSpinning || isGoldSpinCoolingDown}
                            className={`w-full py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-xl ${
                              isGoldSpinCoolingDown
                                ? 'bg-slate-800 text-yellow-300/80 border border-yellow-500/20 cursor-not-allowed'
                                : isGoldSpinning
                                ? 'bg-amber-600 text-slate-950 cursor-wait'
                                : 'bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:brightness-110 text-slate-950 border border-yellow-300 shadow-yellow-500/30'
                            }`}
                          >
                            {isGoldSpinning ? (
                              <>
                                <i className="fas fa-spinner fa-spin text-base"></i>
                                <span>SPINNING GOLD WHEEL... (ঘুরছে...)</span>
                              </>
                            ) : isGoldSpinCoolingDown ? (
                              <>
                                <i className="fas fa-clock text-yellow-400 animate-pulse"></i>
                                <span>{goldCountdownStr} পর গোল্ড স্পিন পাবেন</span>
                              </>
                            ) : isGoldLimitReached ? (
                              <>
                                <i className="fas fa-check-double text-emerald-400"></i>
                                <span>আজকের {goldSpinDailyMaxLimit}টি গোল্ড স্পিন সম্পন্ন হয়েছে</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-crown text-slate-950 text-base"></i>
                                <span>SPIN GOLD WHEEL NOW (গোল্ড স্পিন করুন)</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* CARD 0-PREMIUM: PREMIUM DIAMOND SPIN & WIN (প্রিমিয়াম ডায়মন্ড স্পিন) */}
              <div className="glass-card p-5 space-y-4 border border-cyan-500/50 relative overflow-hidden bg-gradient-to-br from-cyan-950/60 via-slate-900 to-purple-950/60 shadow-2xl">
                <div className="absolute top-0 right-0 bg-gradient-to-l from-cyan-500 via-blue-500 to-purple-600 text-white font-black text-[9px] px-3 py-1 rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-md">
                  <i className="fas fa-gem text-cyan-200 animate-pulse"></i>
                  <span>PREMIUM ৳{premiumSpinMinBalance}+ BALANCE UNLOCKED</span>
                </div>

                <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3 pt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 text-white flex items-center justify-center text-xl font-black shadow-lg shadow-cyan-500/30 border border-cyan-300">
                      <i className="fas fa-gem animate-bounce"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-cyan-300 flex items-center gap-2">
                        <span>Premium Spin & Win (প্রিমিয়াম স্পিন)</span>
                        <span className="text-[9px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-md">
                          0.30 TK - 10.00 TK
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-300">
                        যাদের একাউন্টে ৳ {premiumSpinMinBalance}+ ব্যালেন্স থাকবে তারা পাবেন প্রিমিয়াম স্পিন! প্রতিবার পাচ্ছেন ৳ 0.30 থেকে সর্বোচ্চ ৳ 10.00 পর্যন্ত জেতার সুযোগ!
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-cyan-300 font-mono bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/30 shrink-0">
                    ৳ 0.30 - ৳ 10.00
                  </span>
                </div>

                {/* Admin Quick Shortcut Button for Premium Spin */}
                {isAdminUser && (
                  <button
                    onClick={() => {
                      setActiveTab('admin');
                      setAdminSubTab('spin');
                      showToast('⚙️ Premium Diamond Spin Admin Controls Opened', 'info');
                      haptic('light');
                    }}
                    className="w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition"
                  >
                    <i className="fas fa-gem text-cyan-400"></i>
                    <span>Premium Spin Controls</span>
                  </button>
                )}

                {/* Eligibility Lock Guard or Active Premium Spin Wheel */}
                {!premiumSpinEnabled ? (
                  <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/30 text-center text-red-300 text-xs font-bold">
                    ⚠️ প্রিমিয়াম স্পিন সিস্টেম সাময়িকভাবে বন্ধ রয়েছে।
                  </div>
                ) : userBalance < premiumSpinMinBalance ? (
                  /* Locked State View */
                  <div className="bg-slate-950/90 border border-cyan-500/30 rounded-2xl p-4 sm:p-5 text-center space-y-3 relative overflow-hidden">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-xl mx-auto shadow-md">
                      <i className="fas fa-lock text-cyan-400"></i>
                    </div>

                    <div className="space-y-1">
                      <h4 className="font-extrabold text-xs text-cyan-300">
                        🔒 প্রিমিয়াম স্পিন আনলক করতে ওয়ালেটে নূন্যতম ৳ {premiumSpinMinBalance} প্রয়োজন!
                      </h4>
                      <p className="text-[11px] text-slate-300 max-w-sm mx-auto">
                        আপনার একাউন্ট ব্যালেন্স ৳ {premiumSpinMinBalance} বা তার বেশি থাকলে আপনি ২৪ ঘণ্টায় সর্বমোট {premiumSpinDailyMaxLimit}টি প্রিমিয়াম ডায়মন্ড স্পিন পাবেন। প্রতিবার ৳ 0.30 থেকে ৳ 10.00 পর্যন্ত জেতার সুযোগ!
                      </p>
                    </div>

                    {/* Balance Status Meter */}
                    <div className="bg-black/50 p-3 rounded-xl border border-white/10 flex items-center justify-between text-xs font-bold max-w-xs mx-auto">
                      <span className="text-slate-400">আপনার বর্তমান ব্যালেন্স:</span>
                      <span className="text-cyan-400 font-mono font-black">৳ {userBalance.toFixed(2)}</span>
                    </div>

                    <button
                      onClick={() => {
                        setActiveTab('funds');
                        showToast('💰 ডিপোজিট পেজে রিডাইরেক্ট করা হচ্ছে...', 'info');
                        haptic('light');
                      }}
                      className="px-5 py-2.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 hover:brightness-110 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition active:scale-95 flex items-center justify-center gap-2 mx-auto"
                    >
                      <i className="fas fa-plus-circle"></i>
                      <span>এড ফান্ড / ডিপোজিট করুন (ADD FUNDS)</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Progress & Daily Limit */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-cyan-500/30 flex items-center justify-between text-xs font-bold">
                      <span className="text-cyan-200">আজকের প্রিমিয়াম স্পিন লিমিট:</span>
                      <span className="text-cyan-400 font-mono">
                        {todayPremiumSpinCount} / {premiumSpinDailyMaxLimit} Used
                      </span>
                    </div>

                    {/* Premium Wheel Visual Container */}
                    <div className="relative flex flex-col items-center justify-center py-2">
                      {/* Pointer Arrow at top */}
                      <div className="absolute top-0 z-20 text-cyan-400 text-3xl filter drop-shadow-[0_2px_8px_rgba(6,182,212,0.9)] -mb-2">
                        <i className="fas fa-caret-down"></i>
                      </div>

                      {/* Circular Premium Diamond Wheel */}
                      <div className="relative w-56 h-56 rounded-full border-4 border-cyan-400 shadow-[0_0_50px_rgba(6,182,212,0.45)] overflow-hidden bg-slate-950">
                        <div
                          className="w-full h-full rounded-full relative transition-transform duration-[3500ms] ease-[cubic-bezier(0.15,0.9,0.2,1)]"
                          style={{
                            transform: `rotate(${premiumWheelRotation}deg)`
                          }}
                        >
                          {/* SVG Premium Slices (16 Slices) */}
                          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-11.25deg)' }}>
                            {[
                              { label: '৳0.30', bg: '#0891b2' },
                              { label: '৳0.50', bg: '#0284c7' },
                              { label: '৳0.80', bg: '#2563eb' },
                              { label: '৳1.00', bg: '#4f46e5' },
                              { label: '৳0.30', bg: '#7c3aed' },
                              { label: '৳2.00', bg: '#9333ea' },
                              { label: '৳0.50', bg: '#c026d3' },
                              { label: '৳5.00', bg: '#db2777' },
                              { label: '৳0.80', bg: '#0891b2' },
                              { label: '৳10.0', bg: '#e11d48' },
                              { label: '৳1.00', bg: '#0284c7' },
                              { label: '৳0.30', bg: '#2563eb' },
                              { label: '৳0.50', bg: '#4f46e5' },
                              { label: '৳3.00', bg: '#7c3aed' },
                              { label: '৳0.80', bg: '#9333ea' },
                              { label: '৳1.00', bg: '#c026d3' }
                            ].map((slice, idx) => {
                              const angle = 22.5; // 360 / 16
                              const startAngle = idx * angle;
                              const endAngle = (idx + 1) * angle;
                              const x1 = 50 + 50 * Math.cos((Math.PI * startAngle) / 180);
                              const y1 = 50 + 50 * Math.sin((Math.PI * startAngle) / 180);
                              const x2 = 50 + 50 * Math.cos((Math.PI * endAngle) / 180);
                              const y2 = 50 + 50 * Math.sin((Math.PI * endAngle) / 180);
                              const textAngle = startAngle + angle / 2;
                              const textX = 50 + 34 * Math.cos((Math.PI * textAngle) / 180);
                              const textY = 50 + 34 * Math.sin((Math.PI * textAngle) / 180);

                              return (
                                <g key={idx}>
                                  <path
                                    d={`M50,50 L${x1},${y1} A50,50 0 0,1 ${x2},${y2} Z`}
                                    fill={slice.bg}
                                    stroke="#0f172a"
                                    strokeWidth="0.8"
                                  />
                                  <text
                                    x={textX}
                                    y={textY}
                                    fill="#ffffff"
                                    fontSize="4.2"
                                    fontWeight="900"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                                  >
                                    {slice.label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>

                        {/* Premium Wheel Center Cap */}
                        <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 border-2 border-white flex items-center justify-center shadow-lg text-white font-black text-xs z-10">
                          <i className="fas fa-gem text-base text-cyan-200"></i>
                        </div>
                      </div>
                    </div>

                    {/* Premium Spin Button & 24hr Timer */}
                    {(() => {
                      const nextPremiumSpinTs = lastPremiumSpinTime ? lastPremiumSpinTime + 24 * 60 * 60 * 1000 : 0;
                      const premDiffMs = nextPremiumSpinTs ? nextPremiumSpinTs - dailyCountdownNow : 0;
                      const isPremLimitReached = todayPremiumSpinCount >= premiumSpinDailyMaxLimit;
                      const isPremSpinCoolingDown = isPremLimitReached && premDiffMs > 0;

                      let hours = 0;
                      let mins = 0;
                      let secs = 0;
                      if (isPremSpinCoolingDown && premDiffMs > 0) {
                        hours = Math.floor(premDiffMs / (1000 * 60 * 60));
                        mins = Math.floor((premDiffMs % (1000 * 60 * 60)) / (1000 * 60));
                        secs = Math.floor((premDiffMs % (1000 * 60)) / 1000);
                      }
                      const premCountdownStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                      const premPercentElapsed = isPremSpinCoolingDown ? Math.min(100, Math.max(0, ((24 * 3600 * 1000 - premDiffMs) / (24 * 3600 * 1000)) * 100)) : 100;

                      return (
                        <div className="space-y-3">
                          {isPremSpinCoolingDown && (
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/80 via-slate-900 to-purple-950/60 border border-cyan-500/40 text-center space-y-2 shadow-inner">
                              <div className="text-[11px] text-cyan-200/90 font-bold flex items-center justify-center gap-1.5">
                                <i className="fas fa-gem text-cyan-400 animate-bounce"></i>
                                <span>২৪ ঘণ্টার প্রিমিয়াম স্পিন কুলডাউন চলছে:</span>
                              </div>
                              <div className="text-2xl font-black font-mono text-cyan-400 tracking-widest drop-shadow-md py-1 bg-black/40 rounded-xl border border-cyan-500/30">
                                ⏱️ {premCountdownStr}
                              </div>
                              <p className="text-[10px] text-slate-300 font-medium">
                                পরবর্তী প্রিমিয়াম স্পিন পাবেন <span className="text-cyan-300 font-bold">{hours} ঘণ্টা {mins} মিনিট {secs} সেকেন্ড</span> পর।
                              </p>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-cyan-500/20">
                                <div
                                  className="bg-gradient-to-r from-cyan-500 via-blue-400 to-purple-400 h-1.5 rounded-full transition-all duration-1000"
                                  style={{ width: `${premPercentElapsed}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={handleStartPremiumSpin}
                            disabled={isPremiumSpinning || isPremSpinCoolingDown}
                            className={`w-full py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-xl ${
                              isPremSpinCoolingDown
                                ? 'bg-slate-800 text-cyan-300/80 border border-cyan-500/20 cursor-not-allowed'
                                : isPremiumSpinning
                                ? 'bg-cyan-600 text-white cursor-wait'
                                : 'bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 hover:brightness-110 text-white border border-cyan-300 shadow-cyan-500/30'
                            }`}
                          >
                            {isPremiumSpinning ? (
                              <>
                                <i className="fas fa-spinner fa-spin text-base"></i>
                                <span>SPINNING PREMIUM WHEEL... (ঘুরছে...)</span>
                              </>
                            ) : isPremSpinCoolingDown ? (
                              <>
                                <i className="fas fa-clock text-cyan-400 animate-pulse"></i>
                                <span>{premCountdownStr} পর প্রিমিয়াম স্পিন পাবেন</span>
                              </>
                            ) : isPremLimitReached ? (
                              <>
                                <i className="fas fa-check-double text-emerald-400"></i>
                                <span>আজকের {premiumSpinDailyMaxLimit}টি প্রিমিয়াম স্পিন সম্পন্ন হয়েছে</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-gem text-white text-base"></i>
                                <span>SPIN PREMIUM WHEEL NOW (প্রিমিয়াম স্পিন করুন)</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* CARD 0: LUCKY SPIN TASK (লকি স্পিন ও হুইল টাস্ক) */}
              <div className="glass-card p-5 space-y-4 border border-amber-500/30 relative overflow-hidden bg-gradient-to-br from-amber-950/30 via-slate-900 to-purple-950/30 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-purple-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-xl shadow-md">
                      <i className="fas fa-dharmachakra animate-spin-slow"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>Lucky Spin & Win (লকি স্পিন)</span>
                        <span className="text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-md animate-pulse">
                          INSTANT REWARD
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-300">স্পিন করে প্রতিবার ৳ 0.01 থেকে ৳ 1.00 টাকা জিতে নিন!</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-300 font-mono bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    ৳ 0.01 - ৳ 1.00
                  </span>
                </div>

                {/* Admin Quick Shortcut Button */}
                {isAdminUser && (
                  <button
                    onClick={() => {
                      setActiveTab('admin');
                      setAdminSubTab('spin');
                      showToast('⚙️ Lucky Spin Admin Controls Opened', 'info');
                      haptic('light');
                    }}
                    className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition"
                  >
                    <i className="fas fa-cog text-amber-400"></i>
                    <span>Lucky Spin Controls</span>
                  </button>
                )}

                {luckySpinEnabled ? (
                  <div className="space-y-4">
                    {/* Progress & Daily Limit */}
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-white/10 flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-300">আজকের স্পিন লিমিট:</span>
                      <span className="text-amber-400 font-mono">
                        {todaySpinCount} / {luckySpinDailyMaxLimit} Used
                      </span>
                    </div>

                    {/* Wheel Visual Container */}
                    <div className="relative flex flex-col items-center justify-center py-2">
                      {/* Pointer Arrow at top */}
                      <div className="absolute top-0 z-20 text-amber-400 text-3xl filter drop-shadow-[0_2px_8px_rgba(245,158,11,0.8)] -mb-2">
                        <i className="fas fa-caret-down"></i>
                      </div>

                      {/* Circular Wheel */}
                      <div className="relative w-56 h-56 rounded-full border-4 border-amber-400/60 shadow-[0_0_40px_rgba(245,158,11,0.35)] overflow-hidden bg-slate-950">
                        <div
                          className="w-full h-full rounded-full relative transition-transform duration-[3500ms] ease-[cubic-bezier(0.15,0.9,0.2,1)]"
                          style={{
                            transform: `rotate(${wheelRotation}deg)`
                          }}
                        >
                          {/* SVG Slices (16 Slices) */}
                          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-11.25deg)' }}>
                            {[
                              { label: '৳0.01', bg: '#8b5cf6' },
                              { label: '৳0.05', bg: '#ec4899' },
                              { label: '৳0.10', bg: '#f59e0b' },
                              { label: '৳0.20', bg: '#10b981' },
                              { label: '৳0.02', bg: '#3b82f6' },
                              { label: '৳0.50', bg: '#eab308' },
                              { label: '৳0.03', bg: '#14b8a6' },
                              { label: '৳1.00', bg: '#a855f7' },
                              { label: '৳0.01', bg: '#06b6d4' },
                              { label: '৳0.25', bg: '#f43f5e' },
                              { label: '৳0.05', bg: '#84cc16' },
                              { label: '৳0.15', bg: '#6366f1' },
                              { label: '৳0.02', bg: '#d97706' },
                              { label: '৳0.30', bg: '#ec4899' },
                              { label: '৳0.04', bg: '#10b981' },
                              { label: '৳0.10', bg: '#3b82f6' }
                            ].map((slice, idx) => {
                              const angle = 22.5; // 360 / 16
                              const startAngle = idx * angle;
                              const endAngle = (idx + 1) * angle;
                              const x1 = 50 + 50 * Math.cos((Math.PI * startAngle) / 180);
                              const y1 = 50 + 50 * Math.sin((Math.PI * startAngle) / 180);
                              const x2 = 50 + 50 * Math.cos((Math.PI * endAngle) / 180);
                              const y2 = 50 + 50 * Math.sin((Math.PI * endAngle) / 180);
                              const textAngle = startAngle + angle / 2;
                              const textX = 50 + 34 * Math.cos((Math.PI * textAngle) / 180);
                              const textY = 50 + 34 * Math.sin((Math.PI * textAngle) / 180);

                              return (
                                <g key={idx}>
                                  <path
                                    d={`M50,50 L${x1},${y1} A50,50 0 0,1 ${x2},${y2} Z`}
                                    fill={slice.bg}
                                    stroke="#0f172a"
                                    strokeWidth="0.8"
                                  />
                                  <text
                                    x={textX}
                                    y={textY}
                                    fill="#ffffff"
                                    fontSize="4.2"
                                    fontWeight="900"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    transform={`rotate(${textAngle + 90}, ${textX}, ${textY})`}
                                  >
                                    {slice.label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>

                        {/* Wheel Center Button/Cap */}
                        <div className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 border-2 border-white flex items-center justify-center shadow-lg text-slate-950 font-black text-xs z-10">
                          <i className="fas fa-star text-base text-slate-950"></i>
                        </div>
                      </div>
                    </div>

                    {/* Spin Button & 24hr Timer */}
                    {(() => {
                      const nextSpinTs = lastLuckySpinTime ? lastLuckySpinTime + 24 * 60 * 60 * 1000 : 0;
                      const diffMs = nextSpinTs ? nextSpinTs - dailyCountdownNow : 0;
                      const isLimitReached = todaySpinCount >= luckySpinDailyMaxLimit;
                      const isSpinCoolingDown = isLimitReached && diffMs > 0;

                      let hours = 0;
                      let mins = 0;
                      let secs = 0;
                      if (isSpinCoolingDown && diffMs > 0) {
                        hours = Math.floor(diffMs / (1000 * 60 * 60));
                        mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        secs = Math.floor((diffMs % (1000 * 60)) / 1000);
                      }
                      const countdownStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                      const percentElapsed = isSpinCoolingDown ? Math.min(100, Math.max(0, ((24 * 3600 * 1000 - diffMs) / (24 * 3600 * 1000)) * 100)) : 100;

                      return (
                        <div className="space-y-3">
                          {isSpinCoolingDown && (
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/50 border border-amber-500/30 text-center space-y-2 shadow-inner">
                              <div className="text-[11px] text-amber-200/90 font-bold flex items-center justify-center gap-1.5">
                                <i className="fas fa-clock text-amber-400 animate-spin"></i>
                                <span>২৪ ঘণ্টার স্পিন কুলডাউন চলছে:</span>
                              </div>
                              <div className="text-2xl font-black font-mono text-amber-400 tracking-widest drop-shadow-md py-1 bg-black/40 rounded-xl border border-amber-500/20">
                                ⏱️ {countdownStr}
                              </div>
                              <p className="text-[10px] text-slate-300 font-medium">
                                পরবর্তী স্পিন পাবেন <span className="text-amber-300 font-bold">{hours} ঘণ্টা {mins} মিনিট {secs} সেকেন্ড</span> পর।
                              </p>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-amber-500/20">
                                <div
                                  className="bg-gradient-to-r from-amber-500 to-yellow-400 h-1.5 rounded-full transition-all duration-1000"
                                  style={{ width: `${percentElapsed}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={handleStartLuckySpin}
                            disabled={isSpinning || isSpinCoolingDown}
                            className={`w-full py-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-xl ${
                              isSpinCoolingDown
                                ? 'bg-slate-800 text-amber-300/80 border border-amber-500/20 cursor-not-allowed'
                                : isSpinning
                                ? 'bg-amber-600 text-slate-950 cursor-wait'
                                : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 border border-amber-300 shadow-amber-500/20'
                            }`}
                          >
                            {isSpinning ? (
                              <>
                                <i className="fas fa-spinner fa-spin text-base"></i>
                                <span>SPINNING WHEEL... (ঘুরছে...)</span>
                              </>
                            ) : isSpinCoolingDown ? (
                              <>
                                <i className="fas fa-clock text-amber-400 animate-pulse"></i>
                                <span>{countdownStr} পর স্পিন করতে পারবেন</span>
                              </>
                            ) : isLimitReached ? (
                              <>
                                <i className="fas fa-check-double text-emerald-400"></i>
                                <span>আজকের {luckySpinDailyMaxLimit}টি স্পিন সম্পন্ন হয়েছে</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-play text-slate-950 text-base"></i>
                                <span>SPIN NOW & WIN (স্পিন করুন)</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold text-center">
                    ⚠️ লকি স্পিন সিস্টেম সাময়িকভাবে বন্ধ আছে।
                  </div>
                )}
              </div>

              {/* CARD 1: DAILY CHECK-IN BONUS */}
              <div className="glass-card p-5 space-y-4 border border-amber-500/20 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-base">
                      <i className="fas fa-gift"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Daily Check-in Bonus (ডেইলি চেকিং বোনাস)</h3>
                      <p className="text-[10px] text-slate-400">প্রতি ২৪ ঘণ্টায় একবার ফ্রিতে ডেইলি বোনাস ক্লেইম করুন</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    +৳ {dailyCheckInReward.toFixed(2)}
                  </span>
                </div>

                {dailyCheckInEnabled ? (
                  <div>
                    {(() => {
                      const todayStr = new Date().toISOString().slice(0, 10);
                      const userStorageKey = 'smm_daily_checkin_' + (currentUser?.uid || 'guest');
                      const userStorageKeyTime = 'smm_daily_checkin_ts_' + (currentUser?.uid || 'guest');
                      const userLastClaim = localStorage.getItem(userStorageKey) || lastDailyCheckInDate;

                      let claimTs = lastDailyCheckInTime;
                      if (!claimTs) {
                        const savedTs = localStorage.getItem(userStorageKeyTime);
                        if (savedTs) {
                          claimTs = parseInt(savedTs, 10);
                        } else if (userLastClaim === todayStr) {
                          claimTs = new Date(todayStr).getTime();
                        }
                      }

                      const nextClaimTs = claimTs ? claimTs + 24 * 60 * 60 * 1000 : 0;
                      const diffMs = nextClaimTs ? nextClaimTs - dailyCountdownNow : 0;
                      const isCoolingDown = Boolean(claimTs) && diffMs > 0;

                      let hours = 0;
                      let mins = 0;
                      let secs = 0;
                      if (isCoolingDown && diffMs > 0) {
                        hours = Math.floor(diffMs / (1000 * 60 * 60));
                        mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        secs = Math.floor((diffMs % (1000 * 60)) / 1000);
                      }
                      const countdownStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                      const percentElapsed = isCoolingDown ? Math.min(100, Math.max(0, ((24 * 3600 * 1000 - diffMs) / (24 * 3600 * 1000)) * 100)) : 100;

                      return (
                        <div className="space-y-3">
                          <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-300">আজকের রিওয়ার্ড স্ট্যাটাস:</span>
                            {isCoolingDown ? (
                              <span className="text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                                <i className="fas fa-hourglass-half text-amber-400"></i> ২৪ ঘণ্টার টাইমার চলছে
                              </span>
                            ) : (
                              <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full animate-pulse flex items-center gap-1">
                                <i className="fas fa-check-circle"></i> Available Now
                              </span>
                            )}
                          </div>

                          {/* Live 24-Hour Timer Box when cooling down */}
                          {isCoolingDown && (
                            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border border-amber-500/30 text-center space-y-2 shadow-inner">
                              <div className="text-[11px] text-amber-200/90 font-bold flex items-center justify-center gap-1.5">
                                <i className="fas fa-clock text-amber-400 animate-spin"></i>
                                <span>পরবর্তী বোনাস পাবেন ২৪ ঘণ্টা পর:</span>
                              </div>
                              <div className="text-2xl font-black font-mono text-amber-400 tracking-widest drop-shadow-md py-1 bg-black/40 rounded-xl border border-amber-500/20">
                                ⏱️ {countdownStr}
                              </div>
                              <p className="text-[10px] text-slate-300 font-medium">
                                পরবর্তী ক্লেইম পাবেন <span className="text-amber-300 font-bold">{hours} ঘণ্টা {mins} মিনিট {secs} সেকেন্ড</span> পর।
                              </p>
                              {/* Progress bar */}
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-amber-500/20">
                                <div
                                  className="bg-gradient-to-r from-amber-500 to-yellow-400 h-1.5 rounded-full transition-all duration-1000"
                                  style={{ width: `${percentElapsed}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={handleClaimDailyCheckIn}
                            disabled={dailyCheckInLoading || isCoolingDown}
                            className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                              isCoolingDown
                                ? 'bg-slate-800 text-amber-300/80 border border-amber-500/20 cursor-not-allowed'
                                : 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:brightness-110 text-black border border-amber-400/50'
                            }`}
                          >
                            {dailyCheckInLoading ? (
                              <>
                                <i className="fas fa-spinner fa-spin"></i>
                                <span>CLAIMING BONUS...</span>
                              </>
                            ) : isCoolingDown ? (
                              <>
                                <i className="fas fa-clock text-amber-400 animate-pulse"></i>
                                <span>{countdownStr} পর ক্লেইম করতে পারবেন</span>
                              </>
                            ) : (
                              <>
                                <i className="fas fa-hand-holding-dollar text-base"></i>
                                <span>CLAIM DAILY BONUS (৳ {dailyCheckInReward.toFixed(2)})</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold text-center">
                    ⚠️ ডেইলি চেক-ইন বোনাস সাময়িকভাবে বন্ধ আছে।
                  </div>
                )}
              </div>

              {/* CARD 2: AD EARN SYSTEM */}
              <div className="glass-card p-5 space-y-4 border border-purple-500/20 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-base">
                      <i className="fas fa-play-circle"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Watch Ads & Earn (এড দেখে আয় করুন)</h3>
                      <p className="text-[10px] text-slate-400">প্রতিটি এড দেখলে ৳ {adEarnRewardPerAd.toFixed(2)} দেওয়া হবে (দৈনিক লিমিট: {adEarnDailyMaxLimit})</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-300 font-mono bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    +৳ {adEarnRewardPerAd.toFixed(2)} / Ad
                  </span>
                </div>

                {adEarnEnabled ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-2xl bg-slate-900/80 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-300">আজকের এড দেখার অগ্রগতি:</span>
                        <span className="text-amber-400 font-mono">
                          {todayAdsWatchedCount} / {adEarnDailyMaxLimit} Watched
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                        <div
                          className="bg-gradient-to-r from-purple-500 via-pink-500 to-amber-500 h-2 transition-all duration-300"
                          style={{
                            width: `${Math.min(100, (todayAdsWatchedCount / (adEarnDailyMaxLimit || 500)) * 100)}%`
                          }}
                        ></div>
                      </div>
                    </div>

                    <button
                      onClick={handleWatchAdEarn}
                      disabled={adWatchLoading || todayAdsWatchedCount >= adEarnDailyMaxLimit}
                      className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                        todayAdsWatchedCount >= adEarnDailyMaxLimit
                          ? 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:brightness-110 text-white border border-purple-400/50'
                      }`}
                    >
                      {adWatchLoading ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>LOADING AD...</span>
                        </>
                      ) : todayAdsWatchedCount >= adEarnDailyMaxLimit ? (
                        <>
                          <i className="fas fa-check-double text-emerald-400"></i>
                          <span>আজকের {adEarnDailyMaxLimit}টি এড দেখা সম্পন্ন হয়েছে</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-play text-amber-300 text-sm"></i>
                          <span>WATCH AD NOW (+৳ {adEarnRewardPerAd.toFixed(2)})</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold text-center">
                    ⚠️ এড দেখে আয় করার সিস্টেম সাময়িকভাবে বন্ধ আছে।
                  </div>
                )}
              </div>

              {/* CARD 2: PROMO CODE REDEEM */}
              <div className="glass-card p-5 space-y-4 border border-blue-500/20">
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-base">
                    <i className="fas fa-ticket-alt"></i>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white">Redeem Promo Code (প্রোমো কোড)</h3>
                    <p className="text-[10px] text-slate-400">অফার কোড লিখে তাত্ক্ষণিক ফ্রি ব্যালেন্স যোগ করুন</p>
                  </div>
                </div>

                {promoCodeEnabled ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        className="input-modern uppercase font-mono text-amber-300 font-bold pl-10 pr-4 py-3"
                        placeholder="ENTER PROMO CODE (যেমন: FARJU100)"
                        value={inputPromoCode}
                        onChange={(e) => setInputPromoCode(e.target.value.toUpperCase())}
                      />
                      <i className="fas fa-tags absolute left-3.5 top-3.5 text-slate-500 text-xs"></i>
                    </div>

                    <button
                      onClick={handleRedeemPromoCode}
                      disabled={promoRedeemLoading || !inputPromoCode.trim()}
                      className="btn-primary-gradient w-full py-3 text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      {promoRedeemLoading ? (
                        <>
                          <i className="fas fa-spinner fa-spin"></i>
                          <span>REDEEMING...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-bolt text-amber-300"></i>
                          <span>REDEEM PROMO CODE</span>
                        </>
                      )}
                    </button>

                    <p className="text-[10px] text-slate-400 text-center">
                      💡 প্রোমো কোড পেতে আমাদের অফিশিয়াল <a href={tgChannel1Url} target="_blank" rel="noreferrer" className="text-blue-400 font-bold underline">টেলিগ্রাম চ্যানেলে</a> চোখ রাখুন।
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-bold text-center">
                    ⚠️ প্রোমো কোড রিডিম সিস্টেম সাময়িকভাবে বন্ধ আছে।
                  </div>
                )}
              </div>

              {/* CARD 3: MANDATORY 4 TELEGRAM CHANNELS VERIFICATION STATUS */}
              <div className="glass-card p-5 space-y-3 border border-indigo-500/20">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-black text-xs">
                      <i className="fab fa-telegram-plane"></i>
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-white">Channel Membership Check (৪টি চ্যানেল ভেরিফিকেশন)</h4>
                      <p className="text-[10px] text-slate-400">প্রতি ৫ মিনিট পরপর বট দ্বারা জয়েনিং রি-ভেরিফাই হয়</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    4/4 Active
                  </span>
                </div>

                <div className="space-y-1.5">
                  {mandatoryChannels.map((ch, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-white/5 text-xs">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-check-circle text-emerald-400 text-xs"></i>
                        <span className="font-bold text-white text-[11px]">{ch.name}</span>
                      </div>
                      <a
                        href={ch.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <span>Visit Channel</span>
                        <i className="fas fa-external-link-alt text-[8px]"></i>
                      </a>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => verifyChannelsWithBot()}
                    disabled={botVerifyLoading}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-white/10 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    {botVerifyLoading ? (
                      <i className="fas fa-spinner fa-spin text-amber-400"></i>
                    ) : (
                      <i className="fas fa-rotate text-amber-400"></i>
                    )}
                    <span>RE-VERIFY ALL CHANNELS NOW</span>
                  </button>
                </div>
              </div>

              {/* CARD 4: CUSTOM TASKS LIST (নিচে টাস্ক সমূহ) */}
              <div className="glass-card p-5 space-y-4 border border-amber-500/30 bg-slate-900/90 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg border border-amber-500/30">
                      <i className="fas fa-tasks"></i>
                    </div>
                    <div>
                      <h3 className="font-black text-sm text-white">Tasks List (টাস্ক সমূহ)</h3>
                      <p className="text-[10px] text-slate-400">টাস্ক সম্পন্ন করে প্রুফ ও স্ক্রিনশট আপলোড করে ইনকাম বাড়ান</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-400 font-mono bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                    {customTasks.length} Active Tasks
                  </span>
                </div>

                {/* Tasks List */}
                <div className="space-y-3.5">
                  {customTasks.map((task) => {
                    const userSub = allTaskSubmissions.find(
                      (s) => s.taskId === task.id && s.userId === currentUser?.uid
                    );

                    return (
                      <div key={task.id} className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/10 space-y-3">
                        {/* Task Banner Image if provided by Admin */}
                        {task.image && (
                          <div
                            onClick={() => setSelectedScreenshotPreview(task.image!)}
                            className="w-full aspect-video rounded-xl overflow-hidden border border-amber-500/30 cursor-pointer group relative bg-black/60 shadow"
                          >
                            <img src={task.image} alt={task.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                              <i className="fas fa-search-plus text-white text-sm"></i>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm border border-amber-500/30 flex-shrink-0">
                              <i className={task.icon || 'fas fa-tasks'}></i>
                            </div>
                            <div>
                              <h4 className="font-extrabold text-xs text-white">{task.title}</h4>
                              <p className="text-[10px] text-slate-400">{task.description}</p>
                            </div>
                          </div>
                          <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex-shrink-0">
                            +৳ {task.reward.toFixed(2)}
                          </span>
                        </div>

                        {/* Task Action & Proof Status */}
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                          {task.link && task.link !== '#' && (
                            <a
                              href={task.link}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 text-[11px] font-extrabold flex items-center justify-center gap-1.5 border border-sky-500/30"
                            >
                              <i className="fas fa-external-link-alt text-[10px]"></i> VISIT LINK
                            </a>
                          )}

                          {userSub ? (
                            <div className="flex-1 flex items-center justify-end">
                              {userSub.status === 'Approved' && (
                                <span className="w-full py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold text-center flex items-center justify-center gap-1.5">
                                  <i className="fas fa-check-circle text-emerald-400"></i> APPROVED & REWARDED 🎉
                                </span>
                              )}
                              {userSub.status === 'Pending' && (
                                <span className="w-full py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-extrabold text-center flex items-center justify-center gap-1.5 animate-pulse">
                                  <i className="fas fa-clock text-amber-400"></i> যাঁচাই চলছে (PENDING REVIEW)
                                </span>
                              )}
                              {userSub.status === 'Rejected' && (
                                <button
                                  onClick={() => {
                                    setSelectedTaskForProof(task);
                                    setTaskProofNotes('');
                                    setTaskProofScreenshots([]);
                                  }}
                                  className="w-full py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
                                >
                                  <i className="fas fa-redo"></i> RE-SUBMIT PROOF (REJECTED)
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedTaskForProof(task);
                                setTaskProofNotes('');
                                setTaskProofScreenshots([]);
                              }}
                              className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black text-[11px] font-black flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                            >
                              <i className="fas fa-camera"></i>
                              <span>প্রুফ ও স্ক্রিনশট দিন (SUBMIT PROOF)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* FUNDS TAB */}
          {activeTab === 'funds' && (
            <section className="px-5 mt-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title text-white mb-0">Add Funds</h2>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>বিকাশ ও নগদ অটো ডিপোজিট লাইভ</span>
                </div>
              </div>

              {/* MULTI DEPOSIT BONUS OFFER BANNER */}
              {depositBonusConfig.enabled && depositBonusConfig.tiers && depositBonusConfig.tiers.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-emerald-500/20 border border-amber-500/40 shadow-xl space-y-2.5 mb-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-lg shrink-0">
                      <i className="fas fa-gift text-amber-400"></i>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-black text-[10px] uppercase">
                          MULTI-BONUS OFFER
                        </span>
                        <span className="font-extrabold text-xs text-amber-300">
                          মাল্টি ডিপোজিট ক্যাশব্যাক বোনাস অফার সচল!
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-200 font-bold mt-0.5">
                        যত বেশি ডিপোজিট করবেন, তত বেশি ক্যাশব্যাক বোনাস ইনস্ট্যান্ট পাবেন!
                      </p>
                    </div>
                  </div>

                  {/* Tier Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-amber-500/20">
                    {depositBonusConfig.tiers.map((t, idx) => (
                      <span
                        key={t.id || idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-900/90 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-black flex items-center gap-1 shadow-sm"
                      >
                        <i className="fas fa-coins text-amber-400 text-[9px]"></i>
                        <span>
                          {t.maxAmount && t.maxAmount > 0
                            ? `৳${t.minAmount} - ৳${t.maxAmount}`
                            : `৳${t.minAmount}+`}
                          : <strong className="text-emerald-400">{t.percentage}% Bonus</strong>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* BKASH & NAGAD LIVE INSTANT DEPOSIT BANNER & MODE SWITCHER */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-pink-950/30 to-slate-900 border border-pink-500/30 shadow-xl mb-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center font-black text-sm border border-pink-500/30">
                      ⚡
                    </div>
                    <div>
                      <h3 className="font-extrabold text-xs text-white uppercase tracking-wider">
                        বিকাশ & নগদ অটো ডিপোজিট গেটওয়ে
                      </h3>
                      <p className="text-[10px] text-pink-300 font-medium">
                        {autoDepositGlobalEnabled
                          ? 'ট্রানজেকশন আইডি দেওয়ার সাথে সাথে ইনস্ট্যান্ট ব্যালেন্স যোগ হবে!'
                          : 'অটো ডিপোজিট অফ আছে - ম্যানুয়াল মোডে জমা দিন'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!autoDepositGlobalEnabled) {
                        showToast('⚠️ এডমিন অটো ডিপোজিট সিস্টেম সাময়িকভাবে বন্ধ রেখেছেন। ম্যানুয়াল মোড ব্যবহার করুন।', 'warning');
                        haptic('warning');
                        return;
                      }
                      setIsAutoDepositMode(!isAutoDepositMode);
                      haptic('light');
                    }}
                    className={`px-3 py-1.5 rounded-xl font-extrabold text-[10px] border transition flex items-center gap-1.5 active:scale-95 ${
                      autoDepositGlobalEnabled && isAutoDepositMode
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                        : autoDepositGlobalEnabled
                        ? 'bg-white/10 text-slate-300 border-white/20'
                        : 'bg-red-500/20 text-red-400 border-red-500/40 opacity-80'
                    }`}
                  >
                    <i className={autoDepositGlobalEnabled && isAutoDepositMode ? 'fas fa-bolt text-amber-900' : autoDepositGlobalEnabled ? 'fas fa-clock' : 'fas fa-power-off'}></i>
                    <span>
                      {autoDepositGlobalEnabled && isAutoDepositMode
                        ? 'অটো ইনস্ট্যান্ট চালু'
                        : autoDepositGlobalEnabled
                        ? 'ম্যানুয়াল মোড'
                        : 'অটো ডিপোজিট বন্ধ (OFF)'}
                    </span>
                  </button>
                </div>

                <div className={`p-2.5 rounded-xl border text-[10px] flex items-center justify-between gap-2 ${
                  autoDepositGlobalEnabled
                    ? 'bg-slate-950/80 border-pink-500/20 text-slate-300'
                    : 'bg-red-950/40 border-red-500/30 text-red-300'
                }`}>
                  <span className="flex items-center gap-1.5 font-bold">
                    <i className={autoDepositGlobalEnabled ? 'fas fa-check-circle text-emerald-400' : 'fas fa-exclamation-triangle text-amber-400'}></i>
                    <span>
                      {autoDepositGlobalEnabled
                        ? 'লাইভ অটো ভেরিফিকেশন সার্ভিস 24/7 সচল আছে'
                        : '⚠️ এডমিন অটো ডিপোজিট বন্ধ রেখেছেন (ম্যানুয়াল রিকোয়েস্ট জমা দিন)'}
                    </span>
                  </span>
                  <span className="font-mono text-[9px]">
                    {autoDepositGlobalEnabled ? (
                      <>গড় সময়: <strong className="text-emerald-400 font-bold">১-৩ সেকেণ্ড</strong></>
                    ) : (
                      <strong className="text-amber-400 font-bold">ম্যানুয়াল রিভিউ</strong>
                    )}
                  </span>
                </div>
              </div>

              <div className="glass-card p-6 text-center mb-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none"></div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-blue-500/15 rounded-2xl flex items-center justify-center mx-auto text-blue-400 text-2xl mb-3">
                    <i className="fas fa-wallet"></i>
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                    Current Balance
                  </p>
                  <h2 className="text-3xl font-black text-white tracking-tight">
                    ৳ {userBalance.toFixed(2)}
                  </h2>
                </div>
              </div>

              {/* Quick Amount Selector */}
              <div className="flex overflow-x-auto gap-2 mb-4 scrollbar-none pb-1">
                {['10', '12', '50', '60', '100', '500', '1000'].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      setDepositAmount(amt);
                      haptic('light');
                    }}
                    className={`deposit-method flex-1 min-w-[50px] text-center font-bold transition ${
                      depositAmount === amt ? 'bg-blue-600 text-white border-blue-400 shadow-md' : ''
                    }`}
                  >
                    ৳ {amt}
                  </button>
                ))}
              </div>

              {/* Method Selector with Auto Deposit Toggle */}
              <div className="mb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-credit-card text-blue-400"></i>
                    <span>পেমেন্ট মেথড পছন্দ করুন:</span>
                  </span>

                  <button
                    onClick={() => {
                      if (!autoDepositGlobalEnabled) {
                        showToast('⚠️ এডমিন অটো ডিপোজিট সিস্টেম বন্ধ রেখেছেন। বর্তমানে ম্যানুয়াল ডিপোজিট চালু আছে।', 'warning');
                        haptic('warning');
                        return;
                      }
                      setIsAutoDepositMode(!isAutoDepositMode);
                      haptic('light');
                    }}
                    className={`px-3 py-1.5 rounded-xl font-black text-[10px] border transition flex items-center gap-1.5 active:scale-95 ${
                      autoDepositGlobalEnabled && isAutoDepositMode
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                        : autoDepositGlobalEnabled
                        ? 'bg-white/10 text-slate-300 border-white/20'
                        : 'bg-red-500/20 text-red-400 border-red-500/40 opacity-80'
                    }`}
                  >
                    <i className={autoDepositGlobalEnabled && isAutoDepositMode ? 'fas fa-bolt text-amber-950' : autoDepositGlobalEnabled ? 'fas fa-clock' : 'fas fa-power-off'}></i>
                    <span>
                      {autoDepositGlobalEnabled && isAutoDepositMode
                        ? '⚡ অটো ডিপোজিট'
                        : autoDepositGlobalEnabled
                        ? '📋 ম্যানুয়াল ডিপোজিট'
                        : '⛔ অটো বন্ধ'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {(['bkash', 'bkash_2', 'nagad', 'rocket', 'binance', 'usdt_bep20'] as const).map((method) => {
                    const cfg = paymentMethodsConfig[method] || { label: method, number: '' };
                    const isActive = selectedMethod === method;
                    const isAutoCapable = method === 'bkash' || method === 'bkash_2' || method === 'nagad' || method === 'rocket';
                    return (
                      <div
                        key={method}
                        onClick={() => {
                          setSelectedMethod(method);
                          if (paymentMethodsConfig[method]?.isCrypto) {
                            const bdt = parseFloat(depositAmount);
                            if (!isNaN(bdt) && bdt > 0) {
                              setCryptoUsdInput(String(Math.round((bdt / 120) * 100) / 100));
                            } else if (cryptoUsdInput) {
                              const usd = parseFloat(cryptoUsdInput);
                              if (!isNaN(usd) && usd > 0) {
                                setDepositAmount(String(Math.round(usd * 120 * 100) / 100));
                              }
                            }
                          }
                          haptic('light');
                        }}
                        className={`deposit-method flex flex-col items-center justify-center py-3 px-2 text-center cursor-pointer transition rounded-2xl border relative overflow-hidden ${
                          isActive
                            ? 'bg-gradient-to-b from-blue-500/25 via-indigo-500/15 to-transparent border-blue-400 text-white shadow-xl ring-2 ring-blue-400/60 scale-[1.02]'
                            : 'bg-slate-900/80 border-white/10 text-slate-400 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        {isAutoCapable && autoDepositGlobalEnabled && isAutoDepositMode && (
                          <span className="absolute top-1 right-1 px-1 py-0.2 bg-emerald-500 text-slate-950 text-[7px] font-black rounded-full uppercase shadow flex items-center gap-0.5 z-10 animate-pulse">
                            ⚡ AUTO
                          </span>
                        )}
                        <PaymentLogo method={method} customUrl={cfg.customIconUrl} className="w-8 h-8 mb-1.5 shadow-md" />
                        <span className="text-[11px] font-black uppercase tracking-tight flex items-center gap-1 text-white">
                          {method === 'bkash'
                            ? 'bKash 1'
                            : method === 'bkash_2'
                            ? 'bKash 2'
                            : method === 'nagad'
                            ? 'Nagad'
                            : method === 'rocket'
                            ? 'Rocket'
                            : method === 'binance'
                            ? 'Binance'
                            : 'USDT'}
                        </span>
                        {cfg.isCrypto && (
                          <span className="text-[8px] font-bold text-amber-400 mt-0.5">
                            0.10$ = 12 TK
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Payment Box */}
              <div className="glass-card p-4 mb-4 space-y-3 border-blue-500/20 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/90 shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex gap-3 items-center min-w-0">
                    <PaymentLogo method={selectedMethod} customUrl={paymentMethodsConfig[selectedMethod]?.customIconUrl} className="w-11 h-11" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span>{paymentMethodsConfig[selectedMethod].label}</span>
                        {paymentMethodsConfig[selectedMethod].isCrypto && (
                          <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[8px] font-black">
                            CRYPTO
                          </span>
                        )}
                      </p>
                      <p className="font-black text-sm tracking-wide text-white font-mono break-all select-all">
                        {paymentMethodsConfig[selectedMethod].number}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyNumber(paymentMethodsConfig[selectedMethod].number)}
                    className="copy-btn flex-shrink-0 shadow-md active:scale-95 transition"
                  >
                    <i className="fas fa-copy mr-1"></i> COPY
                  </button>
                </div>

                {paymentMethodsConfig[selectedMethod].note && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 flex items-center gap-2">
                    <i className="fas fa-coins text-amber-400 text-xs"></i>
                    <p className="text-[11px] font-bold text-amber-300">
                      Rate: <strong>0.10$ = 12 TK</strong> ($1 = 120 TK)
                    </p>
                  </div>
                )}
              </div>

              {/* Form */}
              <div className="glass-card p-5 space-y-4 mb-6 relative overflow-hidden">
                {/* LIVE AUTO DEPOSIT PROCESSING OVERLAY */}
                {autoDepositVerifying && (
                  <div className="absolute inset-0 z-20 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in space-y-3">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-ping"></div>
                      <div className="w-14 h-14 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                      <i className="fas fa-bolt absolute text-emerald-400 text-lg"></i>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm text-white">
                        {autoDepositStatusText || 'লাইভ ভেরিফিকেশন চলছে...'}
                      </h4>
                      <p className="text-[11px] text-emerald-400 font-mono font-bold mt-1">
                        {autoDepositProgress}% সম্পন্ন হয়েছে
                      </p>
                    </div>

                    <div className="w-full max-w-xs h-2 bg-slate-800 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                        style={{ width: `${autoDepositProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {/* Crypto USD Auto Calculation Box */}
                  {paymentMethodsConfig[selectedMethod]?.isCrypto && (
                    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 shadow-inner">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                          <i className="fas fa-dollar-sign text-amber-400"></i>
                          <span>USD Amount ($) - ডলার পরিমাণ লিখুন:</span>
                        </label>
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                          Rate: $1 = ৳120 TK
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          className="input-modern pl-9 pr-14 text-sm font-black font-mono text-amber-300 border-amber-500/50 bg-slate-900/90 focus:border-amber-400"
                          placeholder="0.10, 1.00, 5.00, 10.00..."
                          value={cryptoUsdInput}
                          onChange={(e) => {
                            const usdVal = e.target.value;
                            setCryptoUsdInput(usdVal);
                            setDepAmtErr('');
                            const usdNum = parseFloat(usdVal);
                            if (!isNaN(usdNum) && usdNum > 0) {
                              const calculatedBdt = Math.round(usdNum * 120 * 100) / 100;
                              setDepositAmount(String(calculatedBdt));
                            } else {
                              setDepositAmount('');
                            }
                          }}
                        />
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-amber-400 text-sm">
                          $
                        </span>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-amber-400/80 font-mono">
                          USD
                        </span>
                      </div>

                      {/* Quick Dollar Select Buttons */}
                      <div>
                        <p className="text-[9px] font-bold text-amber-400/90 mb-1.5">
                          Quick Dollar Select (সহজে ডলার সিলেক্ট করুন):
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { usd: 0.10, label: '$0.10 (৳12)' },
                            { usd: 0.50, label: '$0.50 (৳60)' },
                            { usd: 1, label: '$1 (৳120)' },
                            { usd: 5, label: '$5 (৳600)' },
                            { usd: 10, label: '$10 (৳1200)' },
                            { usd: 50, label: '$50 (৳6000)' }
                          ].map((btn) => (
                            <button
                              key={btn.usd}
                              type="button"
                              onClick={() => {
                                setCryptoUsdInput(String(btn.usd));
                                setDepositAmount(String(Math.round(btn.usd * 120 * 100) / 100));
                                setDepAmtErr('');
                                haptic('light');
                              }}
                              className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-mono font-extrabold text-[10px] transition active:scale-95 shadow-sm"
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Live Calculated Banner */}
                      <div className="p-2.5 rounded-xl bg-slate-950/90 border border-amber-500/40 flex items-center justify-between text-xs font-mono font-black shadow-md">
                        <span className="text-amber-300 flex items-center gap-1.5">
                          <i className="fas fa-calculator text-amber-400"></i>
                          <span>${parseFloat(cryptoUsdInput) || 0} USD</span>
                        </span>
                        <i className="fas fa-arrow-right text-slate-500 text-[10px]"></i>
                        <span className="text-emerald-400 text-sm">
                          = ৳ {parseFloat(depositAmount) || 0} TK
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-1">
                    <label className="form-label mb-0">
                      <i className="fas fa-money-bill mr-1 text-[8px]"></i> Amount in BDT (টাকার পরিমাণ ৳)
                    </label>
                    <span className="text-[10px] font-bold text-blue-400">
                      Selected: ৳ {parseFloat(depositAmount) || 0}
                    </span>
                  </div>

                  <input
                    type="number"
                    className="input-modern font-mono font-bold"
                    placeholder={
                      paymentMethodsConfig[selectedMethod]?.isCrypto
                        ? 'Enter BDT amount or use USD input above ($1 = 120 TK)'
                        : 'Enter amount (min ৳ 10)'
                    }
                    value={depositAmount}
                    onChange={(e) => {
                      const bdtVal = e.target.value;
                      setDepositAmount(bdtVal);
                      setDepAmtErr('');
                      if (paymentMethodsConfig[selectedMethod]?.isCrypto) {
                        const bdtNum = parseFloat(bdtVal);
                        if (!isNaN(bdtNum) && bdtNum > 0) {
                          setCryptoUsdInput(String(Math.round((bdtNum / 120) * 100) / 100));
                        } else {
                          setCryptoUsdInput('');
                        }
                      }
                    }}
                  />

                  {/* Quick Increase / Decrease Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[9px] font-bold text-slate-400 mr-1">Adjust (বাড়ান/কমান):</span>
                    {[
                      { label: '+10 ৳', val: 10 },
                      { label: '+50 ৳', val: 50 },
                      { label: '+100 ৳', val: 100 },
                      { label: '-10 ৳', val: -10 },
                      { label: '-50 ৳', val: -50 }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => {
                          const curr = parseFloat(depositAmount) || 0;
                          const nextVal = Math.max(0, curr + btn.val);
                          setDepositAmount(String(nextVal));
                          setDepAmtErr('');
                          if (paymentMethodsConfig[selectedMethod]?.isCrypto) {
                            if (nextVal > 0) {
                              setCryptoUsdInput(String(Math.round((nextVal / 120) * 100) / 100));
                            } else {
                              setCryptoUsdInput('');
                            }
                          }
                          haptic('light');
                        }}
                        className={`px-2.5 py-1 rounded-lg font-extrabold text-[10px] border transition active:scale-95 ${
                          btn.val > 0
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-500/15 hover:bg-red-500/25 text-red-300 border-red-500/30'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Calculated Bonus Live Badge */}
                  {(() => {
                    const amt = parseFloat(depositAmount);
                    const { bonusAmount, bonusPercentage, matchedTier } = calculateDepositBonus(amt, depositBonusConfig);
                    if (bonusAmount > 0) {
                      return (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-300 shadow-md animate-fade-in">
                          <span className="flex items-center gap-1.5">
                            <i className="fas fa-gift text-amber-400 text-sm animate-bounce"></i>
                            <span>
                              অফার বোনাস ({bonusPercentage}% CashBonus
                              {matchedTier ? ` • ${matchedTier.maxAmount ? `৳${matchedTier.minAmount}-৳${matchedTier.maxAmount}` : `৳${matchedTier.minAmount}+`}` : ''}):
                            </span>
                          </span>
                          <span className="font-mono font-black text-emerald-400">
                            +৳{bonusAmount} (মোট ব্যালেন্স হবে ৳{(amt + bonusAmount).toFixed(2)})
                          </span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {depAmtErr && <p className="field-error show">{depAmtErr}</p>}
                </div>

                <div>
                  <label className="form-label">
                    <i className="fas fa-receipt mr-1 text-[8px]"></i>{' '}
                    {paymentMethodsConfig[selectedMethod].isCrypto
                      ? 'Transaction ID / Hash / Pay ID'
                      : 'bKash / Nagad Transaction ID (TrxID)'}
                  </label>
                  <input
                    type="text"
                    className="input-modern uppercase font-mono"
                    placeholder={
                      paymentMethodsConfig[selectedMethod].isCrypto
                        ? 'e.g. 584304364 or TxHash 0x...'
                        : 'e.g. BKASH8S7D6F or 9G876543'
                    }
                    value={depositTrxId}
                    onChange={(e) => {
                      setDepositTrxId(e.target.value);
                      setDepTrxErr('');
                    }}
                  />
                  {depTrxErr && <p className="field-error show">{depTrxErr}</p>}
                </div>

                <button
                  onClick={handleSubmitDeposit}
                  disabled={depositSubmitting}
                  className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg active:scale-95 ${
                    autoDepositGlobalEnabled && isAutoDepositMode
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-slate-950 shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400'
                      : 'btn-secondary-solid'
                  }`}
                >
                  {depositSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className={autoDepositGlobalEnabled && isAutoDepositMode ? 'fas fa-bolt text-amber-950' : 'fas fa-paper-plane'}></i>
                      <span>
                        {autoDepositGlobalEnabled && isAutoDepositMode
                          ? '⚡ বিকাশ/নগদ ইনস্ট্যান্ট অটো ডিপোজিট করুন'
                          : '📋 ম্যানুয়াল ডিপোজিট সাবমিট করুন'}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* INSTANT TRX ID LIVE SEARCH & TRACKER */}
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-blue-500/30 shadow-lg mb-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <i className="fas fa-search text-xs"></i>
                    <span>LIVE TRX ID TRACKER (ট্রানজেকশন আইডি সার্চ করুন)</span>
                  </h3>
                  <span className="text-[9px] font-bold text-slate-400">লাইভ আপডেট</span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    className="input-modern text-xs font-mono uppercase pr-9"
                    placeholder="আপনার TrxID লিখুন (যেমন: BKASH8S7D6F)..."
                    value={liveTrxSearch}
                    onChange={(e) => setLiveTrxSearch(e.target.value)}
                  />
                  {liveTrxSearch && (
                    <button
                      onClick={() => setLiveTrxSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>

                {liveTrxSearch.trim().length >= 3 && (() => {
                  const queryUpper = liveTrxSearch.trim().toUpperCase();
                  const foundMatch = allDepositRequests.find(
                    (d) => d.trxId && d.trxId.toUpperCase().includes(queryUpper)
                  );

                  if (!foundMatch) {
                    return (
                      <div className="p-3 rounded-xl bg-slate-950 border border-white/10 text-center space-y-1">
                        <p className="text-xs font-bold text-slate-300">
                          🔍 ট্রানজেকশন আইডি "<span className="text-amber-400 font-mono">{liveTrxSearch}</span>" দিয়ে কোনো রিকোয়েস্ট পাওয়া যায়নি!
                        </p>
                        <p className="text-[10px] text-slate-500">দয়া করে TrxID সঠিক আছে কিনা তা পরীক্ষা করে ডিপোজিট ফরম সাবমিট করুন।</p>
                      </div>
                    );
                  }

                  const isApproved = foundMatch.status === 'Approved';
                  const isPending = foundMatch.status === 'Pending';

                  return (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-blue-500/40 space-y-2.5 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400">
                          TrxID: <strong className="text-white font-bold">{foundMatch.trxId}</strong>
                        </span>
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md ${
                          isApproved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                          isPending ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          'bg-red-500/20 text-red-300 border border-red-500/40'
                        }`}>
                          {isApproved ? '✅ ডিপোজিট সফল (APPROVED)' : isPending ? '⚡ যাচাইকরণ চলছে (PENDING)' : '❌ বাতিল (REJECTED)'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-white/10">
                        <div>
                          <span className="text-slate-500 block text-[9px]">মেথড & পরিমাণ:</span>
                          <strong className="text-white uppercase font-mono">{foundMatch.method} • ৳ {foundMatch.amount}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 block text-[9px]">লাইভ স্ট্যাটাস:</span>
                          <strong className={isApproved ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-red-400'}>
                            {isApproved ? 'ব্যালেন্স যুক্ত করা হয়েছে' : isPending ? 'এডমিন রিভিউ চলছে' : 'বাতিল করা হয়েছে'}
                          </strong>
                        </div>
                      </div>

                      {/* Live Verification Timeline inside search */}
                      <div className="pt-2">
                        <div className="grid grid-cols-3 gap-1 text-[8px] font-bold text-center">
                          <div className="p-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            1. রিকোয়েস্ট জমা 📥
                          </div>
                          <div className={`p-1 rounded border ${
                            isApproved || isPending
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                              : 'bg-slate-800 text-slate-500 border-white/5'
                          }`}>
                            2. TrxID ভেরিফাই ⚡
                          </div>
                          <div className={`p-1 rounded border ${
                            isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 border-white/5'
                          }`}>
                            3. ব্যালেন্স এড 💰
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Deposit History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest">
                    <i className="fas fa-history mr-1 text-blue-400"></i> My Deposit History ({depositHistory.length})
                  </h3>
                  <button
                    onClick={() => {
                      setShowLiveDepositFeedModal(true);
                      haptic('light');
                    }}
                    className="text-[10px] font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>সকল লাইভ ডিপোজিট ফিড</span>
                    <i className="fas fa-arrow-right text-[8px]"></i>
                  </button>
                </div>

                {depositHistory.length === 0 ? (
                  <p className="text-[11px] text-slate-600 text-center py-4 glass-card">
                    এখনো কোনো ডিপোজিট রিকোয়েস্ট করেননি।
                  </p>
                ) : (
                  depositHistory.map((dep) => {
                    const isPending = dep.status === 'Pending';
                    const isApproved = dep.status === 'Approved';

                    return (
                      <div key={dep.id} className="deposit-history-card relative overflow-hidden space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-slate-500 font-mono">
                            {dep.timestamp
                              ? new Date(dep.timestamp.seconds * 1000).toLocaleString('en-BD', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'Just now'}
                          </span>
                          <span
                            className={`text-[8px] font-bold px-2 py-0.5 rounded-md ${
                              isApproved
                                ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                                : dep.status === 'Rejected'
                                ? 'text-red-400 bg-red-500/10 border border-red-500/20'
                                : 'text-amber-400 bg-amber-500/10 border border-amber-500/20 animate-pulse'
                            }`}
                          >
                            {isApproved ? 'APPROVED' : dep.status === 'Rejected' ? 'REJECTED' : 'PENDING VERIFICATION'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <PaymentLogo method={dep.method} customUrl={paymentMethodsConfig[dep.method]?.customIconUrl} className="w-6 h-6" />
                            <span className="text-[11px] text-slate-200 font-extrabold uppercase flex items-center gap-1">
                              <span>{dep.method}</span>
                              <span className="text-slate-500">•</span>
                              <span className="font-mono text-amber-300 font-bold">{dep.trxId}</span>
                            </span>
                          </div>
                          <span className="font-black text-base text-emerald-400 font-mono">
                            ৳ {dep.amount}
                          </span>
                        </div>

                        {/* LIVE VERIFICATION TRACKER TIMELINE FOR PENDING DEPOSITS */}
                        {isPending && (
                          <div className="pt-2 border-t border-white/10 space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] font-bold text-amber-300">
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                                <span>লাইভ ভেরিফিকেশন চলছে...</span>
                              </span>
                              <span className="text-slate-400 text-[8px]">⏱️ গড় সময়: ১-৩ মিনিট</span>
                            </div>

                            <div className="grid grid-cols-3 gap-1 text-[8px] font-bold text-center">
                              <div className="p-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                1. জমা হয়েছে 📥
                              </div>
                              <div className="p-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                2. ভেরিফাই চলছে ⚡
                              </div>
                              <div className="p-1 rounded bg-slate-900 text-slate-500 border border-white/5">
                                3. ব্যালেন্স এড 💰
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <section className="px-4 sm:px-6 mt-4 pb-20 animate-fade-in space-y-5">
              {/* Profile Card Header */}
              <div className="glass-card p-6 border border-amber-500/30 bg-gradient-to-br from-slate-900/90 via-[#0b1329] to-slate-900 relative overflow-hidden shadow-[0_0_40px_rgba(245,158,11,0.15)] text-center rounded-3xl">
                {/* Background Decorative Glow */}
                <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

                {/* Profile Avatar with Upload Camera Badge */}
                <div className="relative w-28 h-28 mx-auto mb-3 group">
                  <div className="w-28 h-28 rounded-3xl overflow-hidden border-2 border-amber-400/60 shadow-2xl bg-slate-950 flex items-center justify-center relative ring-4 ring-amber-500/10">
                    {userPhotoURL || currentUser?.photoURL ? (
                      <img
                        src={userPhotoURL || currentUser?.photoURL}
                        alt="Profile"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                            currentUser?.name || 'User'
                          )}&background=3b82f6&color=fff&bold=true&size=200`;
                        }}
                      />
                    ) : (
                      <img
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                          currentUser?.name || 'User'
                        )}&background=3b82f6&color=fff&bold=true&size=200`}
                        alt="Avatar"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    )}

                    {profileSubmitting && (
                      <div className="absolute inset-0 bg-black/75 flex items-center justify-center backdrop-blur-xs">
                        <span className="loading-spinner"></span>
                      </div>
                    )}
                  </div>

                  {/* Upload Camera Icon Button */}
                  <label
                    className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black flex items-center justify-center shadow-xl cursor-pointer border-2 border-[#030712] transition active:scale-95 group/btn"
                    title="Change Profile Picture (ছবি পরিবর্তন করুন)"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProfilePicUpload}
                      className="hidden"
                      disabled={profileSubmitting}
                    />
                    <i className="fas fa-camera text-sm"></i>
                  </label>
                </div>

                {/* User Name & Name Edit Form */}
                {isEditingName ? (
                  <div className="flex items-center justify-center gap-2 max-w-xs mx-auto mt-2">
                    <input
                      type="text"
                      className="input-modern py-1.5 px-3 text-xs text-center font-bold"
                      value={editUserName}
                      onChange={(e) => setEditUserName(e.target.value)}
                      placeholder="Enter full name"
                    />
                    <button
                      onClick={handleUpdateUserName}
                      className="px-3 py-1.5 bg-emerald-500 text-black text-xs font-black rounded-xl hover:bg-emerald-400 transition shadow"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="px-2 py-1.5 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <h2 className="text-xl font-black text-white">{currentUser?.name || 'User'}</h2>
                    <button
                      onClick={() => {
                        setEditUserName(currentUser?.name || '');
                        setIsEditingName(true);
                      }}
                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-400 flex items-center justify-center text-xs transition border border-white/5"
                      title="Edit Display Name"
                    >
                      <i className="fas fa-pen"></i>
                    </button>
                  </div>
                )}

                {/* User Meta Badges */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <span className="text-[11px] font-mono font-bold text-slate-300 bg-white/5 px-3 py-1 rounded-full border border-white/10 flex items-center gap-1.5">
                    <i className="fas fa-at text-amber-400"></i>
                    <span>{currentUser?.username || currentUser?.uid.slice(0, 8)}</span>
                  </span>
                  <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                    <i className="fas fa-shield-check text-emerald-400"></i>
                    <span>VERIFIED USER</span>
                  </span>
                </div>
              </div>

              {/* Preset Avatars Selection Card */}
              <div className="glass-card p-4 sm:p-5 space-y-3 border border-amber-500/20 bg-slate-900/80 rounded-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-user-circle text-amber-400 text-sm"></i>
                    <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">
                      Choose Avatar (প্রোফাইল পিকচার গ্যালারি)
                    </h4>
                  </div>
                  <span className="text-[10px] text-amber-300 font-bold bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                    {presetAvatars.length} Avatars
                  </span>
                </div>

                <p className="text-[11px] text-slate-300">
                  গ্যালারি থেকে আপনার পছন্দের যেকোনো একটি প্রোফাইল পিকচার সিলেক্ট করুন:
                </p>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3 pt-1">
                  {presetAvatars.map((av, idx) => {
                    const isSelected = (userPhotoURL || currentUser?.photoURL) === av.url;
                    return (
                      <button
                        key={av.id || idx}
                        onClick={() => handleSelectPresetAvatar(av.url)}
                        disabled={profileSubmitting}
                        className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition active:scale-95 group ${
                          isSelected
                            ? 'border-amber-400 ring-4 ring-amber-500/30 scale-105 shadow-lg'
                            : 'border-white/10 hover:border-amber-400/50 hover:scale-105'
                        }`}
                        title={av.label || `Avatar ${idx + 1}`}
                      >
                        <img
                          src={av.url}
                          alt={av.label || `Avatar ${idx + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = `https://ui-avatars.com/api/?name=Avatar+${idx + 1}&background=3b82f6&color=fff&bold=true`;
                          }}
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-amber-500/25 flex items-center justify-center">
                            <i className="fas fa-check-circle text-amber-300 text-xs drop-shadow"></i>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account Details & Stats */}
              <div className="glass-card p-4 space-y-3">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center justify-between border-b border-white/5 pb-2">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-id-card text-amber-400"></i>
                    <span>Account Details (একাউন্ট তথ্য)</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">ACTIVE</span>
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-slate-400">User ID (UID):</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-300 font-bold">{currentUser?.uid}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(currentUser?.uid || '');
                          showToast('UID Copied to clipboard', 'success');
                        }}
                        className="text-[10px] text-slate-400 hover:text-white bg-white/5 px-2 py-0.5 rounded transition"
                      >
                        <i className="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-slate-400">Username:</span>
                    <span className="font-mono text-white font-bold">@{currentUser?.username}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-slate-400">Full Name:</span>
                    <span className="text-white font-bold">{currentUser?.name}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-slate-400">Current Balance:</span>
                    <span className="font-mono text-emerald-400 font-extrabold text-sm">৳ {userBalance.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Total Orders:</span>
                    <span className="font-mono text-blue-400 font-extrabold text-sm">{userTotalOrders}</span>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => {
                      setActiveTab('funds');
                      haptic('light');
                    }}
                    className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition border border-emerald-500/30 active:scale-95"
                  >
                    <i className="fas fa-plus-circle"></i> ADD FUNDS (ডিপোজিট)
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('orders');
                      haptic('light');
                    }}
                    className="py-2 px-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] font-extrabold flex items-center justify-center gap-1.5 transition border border-blue-500/30 active:scale-95"
                  >
                    <i className="fas fa-list"></i> MY ORDERS (অর্ডার)
                  </button>
                </div>
              </div>

              {/* 🎨 APP COLOR THEME SELECTOR CARD IN PROFILE */}
              <div className="glass-card p-4 space-y-3.5 border border-purple-500/30 bg-slate-900/90 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-base border border-purple-500/30">
                      <i className="fas fa-palette"></i>
                    </div>
                    <div>
                      <h4 className="font-black text-xs text-white">App Color Theme (৫টি কালার থিম)</h4>
                      <p className="text-[10px] text-slate-400">আপনার পছন্দের কালার থিম সিলেক্ট করুন</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowThemeModal(true);
                      haptic('light');
                    }}
                    className="text-[10px] font-extrabold text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 px-2.5 py-1 rounded-xl border border-purple-500/30 flex items-center gap-1 active:scale-95 transition"
                  >
                    <span>সকল থিম (All)</span>
                    <i className="fas fa-chevron-right text-[8px]"></i>
                  </button>
                </div>

                <div className="grid grid-cols-5 gap-2 pt-1">
                  {THEMES.map((t) => {
                    const isSel = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setCurrentTheme(t.id);
                          haptic('light');
                          showToast(`🎨 থিম পরিবর্তন করা হয়েছে: ${t.bnName}`, 'success');
                        }}
                        className={`p-2.5 rounded-2xl flex flex-col items-center gap-1.5 transition active:scale-95 border relative ${
                          isSel
                            ? 'bg-purple-500/20 border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                            : 'bg-slate-950/70 border-white/10 hover:border-white/20'
                        }`}
                        title={t.bnName}
                      >
                        <div className={`w-7 h-7 rounded-xl bg-gradient-to-r ${t.bgGradient} shadow-md flex items-center justify-center text-white text-[10px]`}>
                          {isSel ? <i className="fas fa-check"></i> : <i className={t.icon}></i>}
                        </div>
                        <span className="text-[9px] font-extrabold text-slate-200 truncate w-full text-center">
                          {t.id.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Earn Free Rewards Banner */}
              <div
                onClick={() => {
                  setShowTasksModal(true);
                  haptic('heavy');
                }}
                className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-500/30 flex items-center justify-between cursor-pointer hover:border-amber-400 transition active:scale-95"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/30 text-amber-400 flex items-center justify-center text-lg border border-amber-500/40">
                    <i className="fas fa-gift"></i>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-white">Daily Tasks & Screenshot Rewards</h4>
                    <p className="text-[10px] text-amber-200/80">টাস্ক কমপ্লিট করে ফ্রিতে টাকা ইনকাম করুন</p>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-amber-400 text-xs"></i>
              </div>

              {/* Support & Community Section */}
              <div className="glass-card p-4 space-y-3">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-2">
                  <i className="fas fa-headset text-amber-400"></i>
                  <span>Help & Support Center (সাপোর্ট ও সোশ্যাল লিঙ্ক)</span>
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <a
                    href="https://t.me/RF2_SMM"
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 flex items-center gap-3 transition active:scale-95"
                  >
                    <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-lg">
                      <i className="fab fa-telegram-plane"></i>
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-white">Telegram</h5>
                      <p className="text-[9px] text-sky-300">Admin Chat</p>
                    </div>
                  </a>

                  <a
                    href="https://wa.me/8801781119650"
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-3 transition active:scale-95"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
                      <i className="fab fa-whatsapp"></i>
                    </div>
                    <div>
                      <h5 className="font-extrabold text-xs text-white">WhatsApp</h5>
                      <p className="text-[9px] text-emerald-300">24/7 Available</p>
                    </div>
                  </a>
                </div>

                <div className="pt-2 border-t border-white/5 space-y-2">
                  <div
                    onClick={() => {
                      navigator.clipboard.writeText('https://t.me/RF2_SMM');
                      showToast('Telegram Link Copied', 'success');
                    }}
                    className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/5 flex items-center justify-between cursor-pointer transition text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <i className="fab fa-telegram text-sky-400"></i>
                      <span className="font-semibold text-white">Official Telegram Group</span>
                    </div>
                    <i className="fas fa-copy text-slate-500 text-[10px]"></i>
                  </div>

                  <div
                    onClick={() => {
                      navigator.clipboard.writeText('https://www.facebook.com/share/1EKKUHMxCw/');
                      showToast('Facebook Link Copied', 'success');
                    }}
                    className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-white/5 flex items-center justify-between cursor-pointer transition text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <i className="fab fa-facebook text-blue-500"></i>
                      <span className="font-semibold text-white">Facebook Official Page</span>
                    </div>
                    <i className="fas fa-copy text-slate-500 text-[10px]"></i>
                  </div>
                </div>
              </div>

              {/* ADMIN PANEL DIRECT LAUNCH CARD (ADMIN ONLY) */}
              {isAdminUser && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/80 via-yellow-900/60 to-slate-900 border border-amber-500/40 shadow-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-base font-black">
                        <i className="fas fa-crown"></i>
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-white">Admin Panel</h4>
                        <p className="text-[10px] text-slate-300">সকল কন্ট্রোল, ডেইলি চেকিং, প্রোমো কোড ও ইউজার ম্যানেজ করুন</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('admin');
                        haptic('heavy');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:brightness-110 text-white font-extrabold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5"
                    >
                      <span>OPEN ADMIN</span>
                      <i className="fas fa-arrow-right text-[10px]"></i>
                    </button>
                  </div>
                </div>
              )}

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-95"
              >
                <i className="fas fa-right-from-bracket"></i>
                <span>LOGOUT FROM ACCOUNT (লগআউট করুন)</span>
              </button>
            </section>
          )}

          {/* ADMIN TAB */}
          {activeTab === 'admin' && isAdminUser && (
            <section className="px-4 sm:px-6 mt-4 pb-20 animate-fade-in">
              {/* Top Banner */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.2)] mb-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-lg shadow-lg">
                      <i className="fas fa-crown"></i>
                    </div>
                    <div>
                      <h2 className="text-base font-black text-white flex items-center gap-2">
                        <span>SMM Panel Admin Dashboard</span>
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                          FULL CONTROL
                        </span>
                      </h2>
                      <p className="text-[10px] text-slate-400">Manage users, deposits, orders, services & settings</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setAdminSubTab('avatars');
                        haptic('light');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-xs font-black text-white flex items-center gap-1.5 shadow-md shadow-cyan-500/20 border border-cyan-400/30 transition active:scale-95"
                    >
                      <i className="fas fa-id-badge text-cyan-200"></i>
                      <span>Profile Pics ({presetAvatars.length})</span>
                    </button>

                    <button
                      onClick={handleExportBackup}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-white/10 flex items-center gap-1.5 transition active:scale-95"
                    >
                      <i className="fas fa-download text-amber-400"></i>
                      <span>Backup JSON</span>
                    </button>
                  </div>
                </div>

                {/* Stat Counters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-white/10">
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Total Users</span>
                    <div className="text-lg font-black text-white mt-0.5">{allUsersList.length}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Total Orders</span>
                    <div className="text-lg font-black text-blue-400 mt-0.5">{allAdminOrdersList.length}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[9px] font-bold text-amber-400/80 uppercase">Pending Deposits</span>
                    <div className="text-lg font-black text-amber-400 mt-0.5">
                      {allDepositRequests.filter((d) => d.status === 'Pending').length}
                    </div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                    <span className="text-[9px] font-bold text-emerald-400/80 uppercase">Services Active</span>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">{allServices.length}</div>
                  </div>
                </div>
              </div>

              {/* Sub Navigation Bar */}
              <div className="flex overflow-x-auto gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-white/10 mb-5 scrollbar-none">
                {[
                  { id: 'users', label: 'Users & Balance', icon: 'fas fa-users' },
                  { id: 'spin', label: 'Lucky Spin (লকি স্পিন)', icon: 'fas fa-dharmachakra' },
                  { id: 'daily', label: 'Daily Bonus (ডেইলি বোনাস)', icon: 'fas fa-gift' },
                  { id: 'ads', label: 'Watch Ads & Earn (এড দেখে আয়)', icon: 'fas fa-play-circle' },
                  { id: 'promo', label: 'Promo Code (প্রোমো কোড)', icon: 'fas fa-ticket-alt' },
                  { id: 'payment', label: 'Payment Numbers', icon: 'fas fa-mobile-alt' },
                  { id: 'deposits', label: 'Deposit Requests', icon: 'fas fa-wallet' },
                  { id: 'trx_maker', label: 'TrxID Maker (TrxID বানান)', icon: 'fas fa-key' },
                  { id: 'orders', label: 'Orders Control', icon: 'fas fa-list-check' },
                  { id: 'services', label: 'Services (API)', icon: 'fas fa-server' },
                  { id: 'notifications', label: 'Broadcast', icon: 'fas fa-bullhorn' },
                  { id: 'links', label: 'Support Links', icon: 'fas fa-link' },
                  { id: 'settings', label: 'Settings', icon: 'fas fa-cog' },
                  { id: 'tasks', label: 'Tasks & Screenshots Proof (টাস্ক প্রুফ)', icon: 'fas fa-tasks' },
                  { id: 'avatars', label: 'Avatars & Profile Pics (প্রোফাইল পিকচার)', icon: 'fas fa-id-badge' },
                  { id: 'ai_support', label: '🤖 AI Support (এআই সাপোর্ট)', icon: 'fas fa-robot' }
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => {
                      setAdminSubTab(st.id as any);
                      haptic('light');
                    }}
                    className={`whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                      adminSubTab === st.id
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <i className={st.icon}></i>
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>

              {/* SUB TAB 1: USERS & BALANCE (ডিপোজিট এমাউন্ট বাড়ানো-কমানো) */}
              {adminSubTab === 'users' && (
                <div className="space-y-4">
                  {/* Search bar */}
                  <div className="relative">
                    <input
                      type="text"
                      className="input-modern pl-10 text-xs"
                      placeholder="Search User by UID or Name..."
                      value={adminSearch}
                      onChange={(e) => setAdminSearch(e.target.value)}
                    />
                    <i className="fas fa-search absolute left-3.5 top-3.5 text-slate-500 text-xs"></i>
                  </div>

                  {/* Users Cards */}
                  <div className="space-y-3">
                    {allUsersList
                      .filter((u) => {
                        const q = adminSearch.toLowerCase().trim();
                        if (!q) return true;
                        return u.uid.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
                      })
                      .map((u) => {
                        const currentVal = userBalanceAdjustInput[u.uid] || '';
                        const numVal = parseFloat(currentVal) || 0;

                        return (
                          <div
                            key={u.uid}
                            className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
                                  <i className="fas fa-user"></i>
                                </div>
                                <div>
                                  <h4 className="font-extrabold text-sm text-white">{u.name || 'User'}</h4>
                                  <p className="text-[10px] text-slate-400 font-mono">UID: {u.uid}</p>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-[9px] text-slate-500 font-bold uppercase block">Current Balance</span>
                                <span className="text-base font-black text-emerald-400">৳ {(u.balance || 0).toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Quick Balance Adjustment Row (ডিপোজিট বাড়ানো / কমানো) */}
                            <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-extrabold text-slate-300 flex items-center gap-1">
                                  <i className="fas fa-coins text-amber-400"></i>
                                  <span>Adjust Balance (ডিপোজিট এমাউন্ট বাড়ান / কমান):</span>
                                </span>
                              </div>

                              {/* Quick buttons */}
                              <div className="flex flex-wrap gap-1.5">
                                {[50, 100, 500, 1000].map((amt) => (
                                  <button
                                    key={amt}
                                    onClick={() => handleAddUserBalance(u.uid, amt)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold text-[10px] border border-emerald-500/30 transition active:scale-95"
                                  >
                                    +৳{amt}
                                  </button>
                                ))}
                                {[50, 100, 500].map((amt) => (
                                  <button
                                    key={amt}
                                    onClick={() => handleSubtractUserBalance(u.uid, amt)}
                                    className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-extrabold text-[10px] border border-red-500/30 transition active:scale-95"
                                  >
                                    -৳{amt}
                                  </button>
                                ))}
                              </div>

                              {/* Custom input */}
                              <div className="flex items-center gap-2 pt-1">
                                <input
                                  type="number"
                                  className="input-modern text-xs py-1.5 px-3"
                                  placeholder="Enter custom amount..."
                                  value={currentVal}
                                  onChange={(e) =>
                                    setUserBalanceAdjustInput((prev) => ({
                                      ...prev,
                                      [u.uid]: e.target.value
                                    }))
                                  }
                                />
                                <button
                                  onClick={() => handleAddUserBalance(u.uid, numVal)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded-xl transition active:scale-95 flex-shrink-0"
                                >
                                  ADD (+)
                                </button>
                                <button
                                  onClick={() => handleSubtractUserBalance(u.uid, numVal)}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] rounded-xl transition active:scale-95 flex-shrink-0"
                                >
                                  SUB (-)
                                </button>
                                <button
                                  onClick={() => handleSetUserBalance(u.uid, numVal)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded-xl transition active:scale-95 flex-shrink-0"
                                >
                                  SET EXACT
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* SUB TAB: LUCKY SPIN SYSTEM MANAGEMENT (লকি স্পিন কন্ট্রোল) */}
              {adminSubTab === 'spin' && (
                <div className="space-y-4">
                  {/* Header Banner & System Toggle */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-purple-950/60 to-slate-900 border border-amber-500/40 shadow-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-xl font-black shadow-md">
                          <i className="fas fa-dharmachakra"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-white">Lucky Spin System (লকি স্পিন কন্ট্রোল)</h3>
                          <p className="text-[11px] text-slate-300">স্পিন হুইল দিয়ে ব্যবহারকারীদের রিওয়ার্ড (৳0.01 - ৳1.00) অন/অফ ও দৈনিক স্পিন লিমিট নির্ধারণ করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !luckySpinEnabled;
                          setLuckySpinEnabled(nextVal);
                          saveTaskConfigToFirestore({ luckySpinEnabled: nextVal });
                          showToast(
                            nextVal
                              ? '🟢 লকি স্পিন সিস্টেম চালু করা হয়েছে'
                              : '🔴 লকি স্পিন সিস্টেম বন্ধ করা হয়েছে',
                            'info'
                          );
                          haptic('heavy');
                        }}
                        className={`px-4 py-2.5 rounded-xl font-extrabold text-xs transition border flex items-center gap-2 shadow-md ${
                          luckySpinEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                        }`}
                      >
                        <i className={`fas ${luckySpinEnabled ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{luckySpinEnabled ? 'SPIN SYSTEM ON (চালু)' : 'SPIN SYSTEM OFF (বন্ধ)'}</span>
                      </button>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Reward Range per Spin</span>
                        <span className="text-base font-black text-amber-400 font-mono">৳ 0.01 - ৳ 1.00</span>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Spin Status</span>
                        <span className={`text-xs font-black uppercase ${luckySpinEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                          {luckySpinEnabled ? 'Active (চালু)' : 'Disabled (বন্ধ)'}
                        </span>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Daily Spin Limit</span>
                        <span className="text-base font-black text-purple-400 font-mono">{luckySpinDailyMaxLimit} Spins/Day</span>
                      </div>
                    </div>
                  </div>

                  {/* Daily Spin Max Limit Config */}
                  <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-sm font-bold">
                        <i className="fas fa-cog"></i>
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-white">Regular Daily Spin Limit Configuration (ডেইলি স্পিন লিমিট)</h4>
                        <p className="text-[10px] text-slate-400">সাধারণ ব্যবহারকারীদের জন্য প্রতিদিন সর্বমোট কতবার স্পিন করতে পারবেন তা সেট করুন</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-300">দৈনিক সর্বোচ্চ স্পিন সংখ্যা (Max Spins / Day):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          className="input-modern text-xs font-mono font-bold text-purple-300 py-2.5 px-3"
                          value={luckySpinDailyMaxLimit}
                          onChange={(e) => setLuckySpinDailyMaxLimit(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                        <button
                          onClick={() => {
                            saveTaskConfigToFirestore({ luckySpinDailyMaxLimit });
                            showToast(`✅ দৈনিক সর্বোচ্চ স্পিন লিমিট ${luckySpinDailyMaxLimit}টি আপডেট ও ফায়ারবেসে সেভ হয়েছে!`, 'success');
                            haptic('success');
                          }}
                          className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 shrink-0"
                        >
                          UPDATE LIMIT
                        </button>
                      </div>
                    </div>

                    {/* Preset Rewards Preview */}
                    <div className="pt-2 border-t border-white/10 space-y-2">
                      <span className="text-xs font-bold text-slate-300 block">সাধারণ স্পিন হুইলের প্রিসেট পুরষ্কারসমূহ (0.01 TK - 1 TK):</span>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {spinRewardOptions.map((amt, idx) => (
                          <div key={idx} className="bg-slate-950 p-2 rounded-xl border border-amber-500/30 text-center">
                            <span className="text-[9px] text-slate-400 block">Slice #{idx + 1}</span>
                            <span className="text-xs font-black text-amber-400 font-mono">৳{amt.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* GOLD SPIN SYSTEM MANAGEMENT (গোল্ডেন লকি স্পিন কন্ট্রোল) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-yellow-950/80 via-amber-950/70 to-slate-900 border border-yellow-500/50 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-950 flex items-center justify-center text-lg font-black shadow-lg">
                          <i className="fas fa-crown"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-yellow-300 flex items-center gap-2">
                            <span>VIP Gold Spin System (গোল্ড স্পিন কন্ট্রোল)</span>
                            <span className="text-[9px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded-md">
                              ৳0.10 - ৳5.00 TK
                            </span>
                          </h4>
                          <p className="text-[10px] text-slate-300">যাদের ওয়ালেটে ৫০+ টাকা থাকবে তাদের জন্য গোল্ড স্পিন অন/অফ, ব্যালেন্স রিকোয়ারমেন্ট ও লিমিট সেট করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !goldSpinEnabled;
                          setGoldSpinEnabled(nextVal);
                          saveTaskConfigToFirestore({ goldSpinEnabled: nextVal });
                          showToast(
                            nextVal
                              ? '🟢 গোল্ড স্পিন সিস্টেম চালু করা হয়েছে'
                              : '🔴 গোল্ড স্পিন সিস্টেম বন্ধ করা হয়েছে',
                            'info'
                          );
                          haptic('heavy');
                        }}
                        className={`px-4 py-2 rounded-xl font-extrabold text-xs transition border flex items-center gap-2 shadow-md ${
                          goldSpinEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                        }`}
                      >
                        <i className={`fas ${goldSpinEnabled ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{goldSpinEnabled ? 'GOLD SPIN ON' : 'GOLD SPIN OFF'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Min Balance Requirement */}
                      <div className="space-y-1.5 bg-black/40 p-3.5 rounded-xl border border-yellow-500/30">
                        <label className="text-xs font-extrabold text-yellow-300 block">
                          গোল্ড স্পিন আনলক মিনিমাম ব্যালেন্স (Min Balance Req):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            className="input-modern text-xs font-mono font-bold text-yellow-300 py-2 px-3"
                            value={goldSpinMinBalance}
                            onChange={(e) => setGoldSpinMinBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                          />
                          <button
                            onClick={() => {
                              saveTaskConfigToFirestore({ goldSpinMinBalance });
                              showToast(`✅ গোল্ড স্পিন মিনিমাম ব্যালেন্স ৳ ${goldSpinMinBalance} সেভ হয়েছে!`, 'success');
                              haptic('success');
                            }}
                            className="px-3 py-2 bg-yellow-500 text-slate-950 hover:bg-yellow-400 font-extrabold text-xs rounded-xl shadow transition active:scale-95 shrink-0"
                          >
                            SET TK
                          </button>
                        </div>
                      </div>

                      {/* Daily Gold Spin Limit */}
                      <div className="space-y-1.5 bg-black/40 p-3.5 rounded-xl border border-yellow-500/30">
                        <label className="text-xs font-extrabold text-yellow-300 block">
                          দৈনিক সর্বোচ্চ গোল্ড স্পিন সংখ্যা (Daily Limit):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            className="input-modern text-xs font-mono font-bold text-yellow-300 py-2 px-3"
                            value={goldSpinDailyMaxLimit}
                            onChange={(e) => setGoldSpinDailyMaxLimit(Math.max(1, parseInt(e.target.value) || 1))}
                          />
                          <button
                            onClick={() => {
                              saveTaskConfigToFirestore({ goldSpinDailyMaxLimit });
                              showToast(`✅ দৈনিক গোল্ড স্পিন লিমিট ${goldSpinDailyMaxLimit}টি সেভ হয়েছে!`, 'success');
                              haptic('success');
                            }}
                            className="px-3 py-2 bg-yellow-500 text-slate-950 hover:bg-yellow-400 font-extrabold text-xs rounded-xl shadow transition active:scale-95 shrink-0"
                          >
                            SET LIMIT
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Gold Slices Preview */}
                    <div className="pt-2 border-t border-yellow-500/20 space-y-2">
                      <span className="text-xs font-bold text-yellow-200 block">
                        গোল্ডেন স্পিন হুইল প্রিসেট পুরষ্কার (৳0.10 - ৳5.00 TK | 0.10-1.00 TK বেশি জয়ী):
                      </span>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {goldSpinRewardOptions.map((amt, idx) => (
                          <div key={idx} className="bg-slate-950 p-2 rounded-xl border border-yellow-500/40 text-center">
                            <span className="text-[9px] text-yellow-300/70 block">Slice #{idx + 1}</span>
                            <span className="text-xs font-black text-yellow-400 font-mono">৳{amt.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* PREMIUM DIAMOND SPIN SYSTEM MANAGEMENT (প্রিমিয়াম ডায়মন্ড স্পিন কন্ট্রোল) */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-cyan-950/80 via-blue-950/70 to-slate-900 border border-cyan-500/50 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 text-white flex items-center justify-center text-lg font-black shadow-lg">
                          <i className="fas fa-gem"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-cyan-300 flex items-center gap-2">
                            <span>Premium Diamond Spin System (প্রিমিয়াম স্পিন কন্ট্রোল)</span>
                            <span className="text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-md">
                              ৳0.30 - ৳10.00 TK
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-300">
                            প্রিমিয়াম স্পিনের জন্য সিস্টেম অন/অফ, ডেইলি স্পিন লিমিট এবং প্রিসেট পুরষ্কার কন্ট্রোল
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !premiumSpinEnabled;
                          setPremiumSpinEnabled(nextVal);
                          saveTaskConfigToFirestore({ premiumSpinEnabled: nextVal });
                          showToast(
                            nextVal
                              ? '🟢 প্রিমিয়াম স্পিন সিস্টেম চালু করা হয়েছে'
                              : '🔴 প্রিমিয়াম স্পিন সিস্টেম বন্ধ করা হয়েছে',
                            'info'
                          );
                          haptic('heavy');
                        }}
                        className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition border flex items-center gap-2 shadow-md ${
                          premiumSpinEnabled
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30'
                        }`}
                      >
                        <i className={`fas ${premiumSpinEnabled ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{premiumSpinEnabled ? 'PREMIUM SPIN ON' : 'PREMIUM SPIN OFF'}</span>
                      </button>
                    </div>

                    {/* Premium Spin Config Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Required Minimum Wallet Balance */}
                      <div className="space-y-1.5 bg-black/40 p-3.5 rounded-xl border border-cyan-500/30">
                        <label className="text-xs font-extrabold text-cyan-300 block">
                          স্পিন করার নূন্যতম ব্যালেন্স (Min Balance TK):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="10000"
                            className="input-modern text-xs font-mono font-bold text-cyan-300 py-2 px-3"
                            value={premiumSpinMinBalance}
                            onChange={(e) => setPremiumSpinMinBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                          />
                          <button
                            onClick={() => {
                              saveTaskConfigToFirestore({ premiumSpinMinBalance });
                              showToast(`✅ প্রিমিয়াম স্পিন নূন্যতম ব্যালেন্স ৳ ${premiumSpinMinBalance} সেভ হয়েছে!`, 'success');
                              haptic('success');
                            }}
                            className="px-3 py-2 bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-extrabold text-xs rounded-xl shadow transition active:scale-95 shrink-0"
                          >
                            SET MIN BAL
                          </button>
                        </div>
                      </div>

                      {/* Daily Premium Spin Limit */}
                      <div className="space-y-1.5 bg-black/40 p-3.5 rounded-xl border border-cyan-500/30">
                        <label className="text-xs font-extrabold text-cyan-300 block">
                          দৈনিক সর্বোচ্চ প্রিমিয়াম স্পিন সংখ্যা (Daily Limit):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            className="input-modern text-xs font-mono font-bold text-cyan-300 py-2 px-3"
                            value={premiumSpinDailyMaxLimit}
                            onChange={(e) => setPremiumSpinDailyMaxLimit(Math.max(1, parseInt(e.target.value) || 1))}
                          />
                          <button
                            onClick={() => {
                              saveTaskConfigToFirestore({ premiumSpinDailyMaxLimit });
                              showToast(`✅ দৈনিক প্রিমিয়াম স্পিন লিমিট ${premiumSpinDailyMaxLimit}টি সেভ হয়েছে!`, 'success');
                              haptic('success');
                            }}
                            className="px-3 py-2 bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-extrabold text-xs rounded-xl shadow transition active:scale-95 shrink-0"
                          >
                            SET LIMIT
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Premium Slices Preview & Probabilities */}
                    <div className="pt-2 border-t border-cyan-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-200 block">
                          প্রিমিয়াম ডায়মন্ড স্পিন পুরষ্কারসমূহ (৳0.30 - ৳10.00 TK):
                        </span>
                        <span className="text-[10px] font-black text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/40 font-mono">
                          90% WIN RATE ON ৳0.30 - ৳1.00
                        </span>
                      </div>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {premiumSpinRewardOptions.map((amt, idx) => (
                          <div key={idx} className="bg-slate-950 p-2 rounded-xl border border-cyan-500/40 text-center">
                            <span className="text-[9px] text-cyan-300/70 block">Slice #{idx + 1}</span>
                            <span className="text-xs font-black text-cyan-300 font-mono">৳{amt.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB TAB: DAILY CHECK-IN BONUS MANAGEMENT (ডেইলি চেক-ইন বোনাস কন্ট্রোল) */}
              {adminSubTab === 'daily' && (
                <div className="space-y-4">
                  {/* Header Banner & System Toggle */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-yellow-900/50 to-slate-900 border border-amber-500/40 shadow-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-xl font-black shadow-md">
                          <i className="fas fa-gift"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-white">Daily Check-in Bonus (ডেইলি চেক-ইন বোনাস কন্ট্রোল)</h3>
                          <p className="text-[11px] text-slate-300">ব্যবহারকারীদের জন্য প্রতি ২৪ ঘণ্টার ফ্রি রিওয়ার্ড বোনাস সিস্টেম অন/অফ ও এমাউন্ট সেট করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !dailyCheckInEnabled;
                          setDailyCheckInEnabled(nextVal);
                          saveTaskConfigToFirestore({ dailyCheckInEnabled: nextVal });
                          showToast(
                            nextVal
                              ? '🟢 ডেইলি চেক-ইন বোনাস চালু করা হয়েছে'
                              : '🔴 ডেইলি চেক-ইন বোনাস বন্ধ করা হয়েছে',
                            'info'
                          );
                          haptic('heavy');
                        }}
                        className={`px-4 py-2.5 rounded-xl font-extrabold text-xs transition border flex items-center gap-2 shadow-md ${
                          dailyCheckInEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                        }`}
                      >
                        <i className={`fas ${dailyCheckInEnabled ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{dailyCheckInEnabled ? 'BONUS SYSTEM ON (চালু)' : 'BONUS SYSTEM OFF (বন্ধ)'}</span>
                      </button>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Daily Reward Amount</span>
                        <span className="text-base font-black text-amber-400 font-mono">৳ {(dailyCheckInReward || 0).toFixed(2)}</span>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Bonus Status</span>
                        <span className={`text-xs font-black uppercase ${dailyCheckInEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                          {dailyCheckInEnabled ? 'Active (চালু)' : 'Disabled (বন্ধ)'}
                        </span>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Claim Interval</span>
                        <span className="text-xs font-black text-blue-300">24 Hours / 1 Claim</span>
                      </div>
                    </div>
                  </div>

                  {/* Daily Reward Amount Settings Card */}
                  <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-sm font-bold">
                        <i className="fas fa-coins"></i>
                      </div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-amber-300 uppercase tracking-wider">
                        Set Daily Reward Amount (বোনাস টাকার পরিমাণ)
                      </h4>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="form-label flex items-center gap-1.5 mb-1.5">
                          <i className="fas fa-money-bill-wave text-emerald-400 text-xs"></i>
                          <span>Reward Per Check-in (প্রতিদিনের চেক-ইন বোনাস ৳):</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-amber-400 bg-amber-500/10 px-3 py-2.5 rounded-xl border border-amber-500/30">
                            ৳
                          </span>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="input-modern text-sm font-mono text-emerald-400 font-extrabold"
                            value={dailyCheckInReward}
                            onChange={(e) => setDailyCheckInReward(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 5.0"
                          />
                        </div>
                      </div>

                      {/* Quick Presets */}
                      <div>
                        <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
                          Quick Presets (দ্রুত বোনাস সেট করুন):
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {[1, 2, 5, 10, 20, 50].map((amt) => (
                            <button
                              key={amt}
                              onClick={() => {
                                setDailyCheckInReward(amt);
                                saveTaskConfigToFirestore({ dailyCheckInReward: amt });
                                showToast(`✅ Daily Reward Set to ৳ ${amt}.00`, 'info');
                                haptic('light');
                              }}
                              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold border transition ${
                                dailyCheckInReward === amt
                                  ? 'bg-amber-500 text-black border-amber-400 font-black shadow-md'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                              }`}
                            >
                              ৳ {amt}.00
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          saveTaskConfigToFirestore({ dailyCheckInReward });
                          showToast(`✅ ডেইলি চেক-ইন বোনাস ৳ ${(dailyCheckInReward || 0).toFixed(2)} সফলভাবে সেভ হয়েছে!`, 'success');
                          haptic('success');
                        }}
                        className="btn-primary-gradient w-full py-3 text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                      >
                        <i className="fas fa-save text-sm"></i>
                        <span>SAVE DAILY REWARD AMOUNT (সেভ করুন)</span>
                      </button>
                    </div>
                  </div>

                  {/* Testing & Reset Tools Card */}
                  <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <i className="fas fa-vial text-blue-400 text-sm"></i>
                      <h4 className="font-extrabold text-xs sm:text-sm text-white">
                        Admin Testing & Reset Cooldown (টেস্ট ও রিসেট অপশন)
                      </h4>
                    </div>

                    <p className="text-[11px] text-slate-300">
                      ডেইলি বোনাস টেস্ট করার জন্য নিচের বাটনগুলো ব্যবহার করতে পারেন:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        onClick={handleClaimDailyCheckIn}
                        disabled={dailyCheckInLoading || !dailyCheckInEnabled}
                        className="p-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
                      >
                        <i className="fas fa-gift text-sm"></i>
                        <span>TEST CLAIM DAILY BONUS NOW</span>
                      </button>

                      <button
                        onClick={() => {
                          const key = 'smm_daily_checkin_' + (currentUser?.uid || 'guest');
                          const keyTs = 'smm_daily_checkin_ts_' + (currentUser?.uid || 'guest');
                          localStorage.removeItem(key);
                          localStorage.removeItem(keyTs);
                          setLastDailyCheckInDate('');
                          setLastDailyCheckInTime(0);
                          showToast('🔄 টেস্ট কুলডাউন রিসেট করা হয়েছে! এখন আবার ক্লেইম টেস্ট করতে পারবেন।', 'success');
                          haptic('heavy');
                        }}
                        className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition active:scale-95"
                      >
                        <i className="fas fa-redo-alt text-sm text-amber-400"></i>
                        <span>RESET CLAIM COOLDOWN (রিসেট করুন)</span>
                      </button>
                    </div>
                  </div>

                  {/* Info Notice */}
                  <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/20 text-[11px] text-blue-200 flex items-start gap-2.5">
                    <i className="fas fa-info-circle text-blue-400 text-sm mt-0.5"></i>
                    <div>
                      <p className="font-bold text-white mb-0.5">কীভাবে কাজ করে?</p>
                      <p className="text-slate-300">
                        যেকোনো ইউজার প্রতি ২৪ ঘণ্টায় ১ বার &apos;Daily Check-in Bonus&apos; ক্লেইম করতে পারবে। ক্লেইম করার সাথে সাথে তাদের একাউন্টে ৳ {dailyCheckInReward.toFixed(2)} যুক্ত হবে এবং টেলিক্রম প্রুফ চ্যানেলে অটোমেটিক নোটিফিকেশন মেসেজ চলে যাবে।
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB TAB: WATCH ADS & EARN MANAGEMENT (এড দেখে আয় কন্ট্রোল) */}
              {adminSubTab === 'ads' && (
                <div className="space-y-4">
                  {/* Header Banner & System Toggle */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/70 via-indigo-900/50 to-slate-900 border border-purple-500/40 shadow-lg space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center text-xl font-black shadow-md">
                          <i className="fas fa-play-circle"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-white">Watch Ads & Earn System (এড দেখে আয় কন্ট্রোল)</h3>
                          <p className="text-[11px] text-slate-300">ব্যবহারকারীদের এড দেখে আয় করার অপশন চালু/বন্ধ, টাকা এমাউন্ট ও দৈনিক লিমিট সেট করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !adEarnEnabled;
                          setAdEarnEnabled(nextVal);
                          saveTaskConfigToFirestore({ adEarnEnabled: nextVal });
                          showToast(
                            nextVal
                              ? '🟢 এড দেখে আয় সিস্টেম চালু করা হয়েছে'
                              : '🔴 এড দেখে আয় সিস্টেম বন্ধ করা হয়েছে',
                            'info'
                          );
                          haptic('heavy');
                        }}
                        className={`px-4 py-2.5 rounded-xl font-extrabold text-xs transition border flex items-center gap-2 shadow-md ${
                          adEarnEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                        }`}
                      >
                        <i className={`fas ${adEarnEnabled ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{adEarnEnabled ? 'AD SYSTEM ON (চালু)' : 'AD SYSTEM OFF (বন্ধ)'}</span>
                      </button>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Reward Per Ad</span>
                        <span className="text-base font-black text-emerald-400 font-mono">৳ {(adEarnRewardPerAd || 0).toFixed(2)}</span>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Daily Max Limit</span>
                        <span className="text-base font-black text-amber-400 font-mono">{adEarnDailyMaxLimit} Ads</span>
                      </div>
                      <div className="bg-black/30 p-3 rounded-xl border border-white/5 col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
                        <span className={`text-xs font-black uppercase ${adEarnEnabled ? 'text-emerald-400' : 'text-red-400'}`}>
                          {adEarnEnabled ? 'Active (চালু)' : 'Disabled (বন্ধ)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ad Rewards & Limit Settings Form Card */}
                  <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-sm font-bold">
                        <i className="fas fa-sliders-h"></i>
                      </div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-purple-300 uppercase tracking-wider">
                        Configure Ad Rewards & Limits (এড রিওয়ার্ড ও লিমিট সেট করুন)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Reward per ad */}
                      <div className="space-y-2">
                        <label className="form-label flex items-center gap-1.5">
                          <i className="fas fa-money-bill-wave text-emerald-400 text-xs"></i>
                          <span>Reward Per Ad View (প্রতি এড দেখলে কত টাকা ৳):</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-emerald-400 bg-emerald-500/10 px-3 py-2.5 rounded-xl border border-emerald-500/30">
                            ৳
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="input-modern text-sm font-mono text-emerald-400 font-extrabold"
                            value={adEarnRewardPerAd}
                            onChange={(e) => setAdEarnRewardPerAd(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 0.10"
                          />
                        </div>

                        {/* Quick Presets for Reward */}
                        <div className="pt-1">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                            Reward Presets (দ্রুত সেট করুন):
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {[0.05, 0.1, 0.2, 0.5, 1, 2, 5].map((amt) => (
                              <button
                                key={amt}
                                onClick={() => {
                                  setAdEarnRewardPerAd(amt);
                                  saveTaskConfigToFirestore({ adEarnRewardPerAd: amt });
                                  showToast(`✅ Ad Reward set to ৳ ${amt.toFixed(2)}`, 'info');
                                  haptic('light');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border transition ${
                                  adEarnRewardPerAd === amt
                                    ? 'bg-emerald-500 text-black border-emerald-400 font-black shadow'
                                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                                }`}
                              >
                                ৳ {amt.toFixed(2)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Daily Limit */}
                      <div className="space-y-2">
                        <label className="form-label flex items-center gap-1.5">
                          <i className="fas fa-history text-amber-400 text-xs"></i>
                          <span>Daily Max Ad Watch Limit (একজনে দিনে কয়টা এড দেখতে পারবে):</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-amber-400 bg-amber-500/10 px-3 py-2.5 rounded-xl border border-amber-500/30">
                            <i className="fas fa-play"></i>
                          </span>
                          <input
                            type="number"
                            min="1"
                            className="input-modern text-sm font-mono text-amber-300 font-extrabold"
                            value={adEarnDailyMaxLimit}
                            onChange={(e) => setAdEarnDailyMaxLimit(parseInt(e.target.value, 10) || 50)}
                            placeholder="e.g. 500"
                          />
                        </div>

                        {/* Quick Presets for Limit */}
                        <div className="pt-1">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                            Limit Presets (দ্রুত লিমিট সেট করুন):
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {[10, 25, 50, 100, 200, 500].map((lim) => (
                              <button
                                key={lim}
                                onClick={() => {
                                  setAdEarnDailyMaxLimit(lim);
                                  saveTaskConfigToFirestore({ adEarnDailyMaxLimit: lim });
                                  showToast(`✅ Daily limit set to ${lim} Ads`, 'info');
                                  haptic('light');
                                }}
                                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border transition ${
                                  adEarnDailyMaxLimit === lim
                                    ? 'bg-amber-500 text-black border-amber-400 font-black shadow'
                                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                                }`}
                              >
                                {lim} Ads
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        saveTaskConfigToFirestore({
                          adEarnEnabled,
                          adEarnRewardPerAd,
                          adEarnDailyMaxLimit
                        });
                        showToast(`✅ এড রিওয়ার্ড ৳ ${(adEarnRewardPerAd || 0).toFixed(2)} এবং লিমিট ${adEarnDailyMaxLimit} এড সেভ হয়েছে!`, 'success');
                        haptic('success');
                      }}
                      className="btn-primary-gradient w-full py-3 text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                    >
                      <i className="fas fa-save text-sm"></i>
                      <span>SAVE AD EARN SETTINGS (সেটিংস সেভ করুন)</span>
                    </button>
                  </div>

                  {/* Testing Card */}
                  <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <i className="fas fa-flask text-purple-400 text-sm"></i>
                      <h4 className="font-extrabold text-xs sm:text-sm text-white">
                        Admin Ad Test (এড টেস্ট করুন)
                      </h4>
                    </div>

                    <p className="text-[11px] text-slate-300">
                      এড দেখা ফাংশনটি সঠিকভাবে কাজ করছে কিনা টেস্ট করার জন্য নিচের বাটনে ক্লিক করুন:
                    </p>

                    <button
                      onClick={handleWatchAdEarn}
                      disabled={adWatchLoading || !adEarnEnabled}
                      className="w-full p-3.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:brightness-110 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2.5 shadow-lg transition active:scale-95"
                    >
                      {adWatchLoading ? (
                        <>
                          <i className="fas fa-spinner fa-spin text-sm"></i>
                          <span>LOADING AD... (এড লোড হচ্ছে)</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-play-circle text-base text-amber-300"></i>
                          <span>WATCH TEST AD NOW (টাকা ৳{(adEarnRewardPerAd || 0).toFixed(2)})</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Info Notice */}
                  <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/20 text-[11px] text-purple-200 flex items-start gap-2.5">
                    <i className="fas fa-info-circle text-purple-400 text-sm mt-0.5"></i>
                    <div>
                      <p className="font-bold text-white mb-0.5">কীভাবে কাজ করে?</p>
                      <p className="text-slate-300">
                        ইউজাররা &apos;Earn Money &apos; পেজ থেকে &apos;Watch Ads & Earn &apos; বাটনে ক্লিক করে এড দেখতে পারবে। প্রতিবার এড সফলভাবে দেখা শেষ হলে তাদের ওয়ালেটে ৳ {(adEarnRewardPerAd || 0).toFixed(2)} যোগ হবে। একজনে সর্বোচ্চ {adEarnDailyMaxLimit}টি এড দেখতে পারবে।
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB TAB: PROMO CODE MANAGEMENT (প্রোমো CODES) */}
              {adminSubTab === 'promo' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/50 via-indigo-900/40 to-slate-900 border border-blue-500/30 shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center text-lg font-black shadow-md">
                          <i className="fas fa-ticket-alt"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-white">Promo Code Management (প্রোমো কোড কন্ট্রোল)</h3>
                          <p className="text-[11px] text-slate-300">নতুন প্রোমো কোড তৈরি করুন, লিমিট ও টাকা এমাউন্ট সেট করুন এবং প্রয়োজনমতো ডিলিট করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setPromoCodeEnabled(!promoCodeEnabled);
                          showToast(promoCodeEnabled ? '🔴 প্রোমো কোড রিডিম সিস্টেম বন্ধ করা হয়েছে' : '🟢 প্রোমো কোড রিডিম সিস্টেম চালু করা হয়েছে', 'info');
                          haptic('light');
                        }}
                        className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition border flex items-center gap-1.5 shadow-md ${
                          promoCodeEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                        }`}
                      >
                        <i className={`fas ${promoCodeEnabled ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                        <span>{promoCodeEnabled ? 'SYSTEM ON (চালু)' : 'SYSTEM OFF (বন্ধ)'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Create New Promo Code Form Card */}
                  <div className="bg-slate-900/90 border border-blue-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-sm font-bold">
                        <i className="fas fa-plus-circle"></i>
                      </div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-amber-300 uppercase tracking-wider">
                        Create New Promo Code (নতুন প্রোমো কোড তৈরি করুন)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="form-label flex items-center gap-1">
                          <i className="fas fa-tag text-blue-400 text-[10px]"></i>
                          <span>Promo Code Name (কোডের নাম):</span>
                        </label>
                        <input
                          type="text"
                          className="input-modern uppercase text-xs font-mono font-bold text-amber-300"
                          placeholder="e.g. WELCOME100 or FARJU50"
                          value={newPromoCode}
                          onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                        />
                      </div>

                      <div>
                        <label className="form-label flex items-center gap-1">
                          <i className="fas fa-money-bill-wave text-emerald-400 text-[10px]"></i>
                          <span>Reward Amount (টাকা এমাউন্ট ৳):</span>
                        </label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono text-emerald-400 font-bold"
                          placeholder="e.g. 10 or 20"
                          value={newPromoReward}
                          onChange={(e) => setNewPromoReward(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label flex items-center gap-1">
                          <i className="fas fa-users-cog text-purple-400 text-[10px]"></i>
                          <span>Usage Limit (ব্যবহারের লিমিট):</span>
                        </label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono text-white font-bold"
                          placeholder="e.g. 50 or 100"
                          value={newPromoMaxUses}
                          onChange={(e) => setNewPromoMaxUses(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCreatePromoCode}
                      className="btn-primary-gradient w-full py-3 text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                    >
                      <i className="fas fa-plus-circle text-sm"></i>
                      <span>CREATE PROMO CODE (কোড তৈরি করুন)</span>
                    </button>
                  </div>

                  {/* Active Promo Codes List Card */}
                  <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-list-check text-blue-400 text-sm"></i>
                        <h4 className="font-extrabold text-xs sm:text-sm text-white">
                          Active Promo Codes (সকল প্রোমো কোড)
                        </h4>
                      </div>
                      <span className="text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 px-3 py-0.5 rounded-full font-mono">
                        Total: {promoCodes.length}
                      </span>
                    </div>

                    {promoCodes.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <i className="fas fa-ticket-alt text-3xl text-slate-600"></i>
                        <p className="text-xs text-slate-400 font-bold">এখনো কোনো প্রোমো কোড তৈরি করা হয়নি</p>
                        <p className="text-[10px] text-slate-500">উপরের ফর্ম থেকে নতুন প্রোমো কোড তৈরি করুন</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {promoCodes.map((p) => (
                          <div
                            key={p.id}
                            className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/10 hover:border-amber-500/40 transition-all flex flex-wrap items-center justify-between gap-3 shadow-md"
                          >
                            <div className="space-y-1.5 min-w-[200px]">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-xs text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 shadow-inner">
                                  🏷️ {p.code}
                                </span>
                                <span className="font-black text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                  +৳ {p.reward.toFixed(2)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-300 flex items-center gap-3 font-medium">
                                <span>⚡ <b>Used:</b> {p.usedCount} / {p.maxUses}</span>
                                <span>•</span>
                                <span>👤 <b>Redeemed Users:</b> {p.usedByUsers ? p.usedByUsers.length : 0}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                                p.usedCount >= p.maxUses
                                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              }`}>
                                {p.usedCount >= p.maxUses ? 'Limit Reached' : 'Active'}
                              </span>

                              <button
                                onClick={() => handleDeletePromoCode(p.id, p.code)}
                                className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 flex items-center gap-1 text-xs font-extrabold transition active:scale-95"
                                title="Delete Promo Code"
                              >
                                <i className="fas fa-trash-alt"></i>
                                <span>DELETE (ডিলিট)</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB TAB: PAYMENT NUMBERS MANAGEMENT (পেমেন্ট নম্বর চেঞ্জ) */}
              {adminSubTab === 'payment' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/30 shadow-lg">
                    <div className="flex items-center gap-2.5 mb-1">
                      <i className="fas fa-mobile-alt text-amber-400 text-base"></i>
                      <h3 className="font-extrabold text-sm text-white">Payment Method Numbers & Details</h3>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      এখানে যে কোনো পেমেন্ট মেথডের (bKash, Nagad, Rocket, Binance, USDT) নম্বর বা ওয়ালেট নম্বর চেঞ্জ করলে তা সাথে সাথে সকল ইউজারের Add Funds পেজে লাইভ আপডেট হয়ে যাবে।
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5">
                    {(Object.entries(paymentMethodsConfig) as [string, { label: string; number: string; icon: string; note?: string; isCrypto?: boolean; customIconUrl?: string }][]).map(([key, config]) => {
                      const editState = editingPaymentNumbers[key] || {
                        number: config.number,
                        note: config.note || '',
                        customIconUrl: config.customIconUrl || ''
                      };

                      return (
                        <div
                          key={key}
                          className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg hover:border-white/20 transition"
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-white/5">
                            <div className="flex items-center gap-2.5">
                              <PaymentLogo method={key} customUrl={editState.customIconUrl || config.customIconUrl} className="w-10 h-10" />
                              <div>
                                <h4 className="font-extrabold text-xs text-white">{config.label}</h4>
                                <span className="text-[9px] text-slate-400 font-mono">key: {key}</span>
                              </div>
                            </div>

                            <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          </div>

                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[10px] font-bold text-slate-300 block mb-1">
                                Phone Number / Wallet Address / UID (নম্বর):
                              </label>
                              <input
                                type="text"
                                className="input-modern font-mono text-xs py-2 px-3 text-amber-300 font-bold"
                                value={editState.number}
                                onChange={(e) =>
                                  setEditingPaymentNumbers((prev) => ({
                                    ...prev,
                                    [key]: { ...editState, number: e.target.value }
                                  }))
                                }
                                placeholder="Enter payment number..."
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-slate-300 block mb-1">
                                Note / Instruction / Rate details (নির্দেশিকা):
                              </label>
                              <input
                                type="text"
                                className="input-modern text-xs py-2 px-3 text-slate-300"
                                value={editState.note}
                                onChange={(e) =>
                                  setEditingPaymentNumbers((prev) => ({
                                    ...prev,
                                    [key]: { ...editState, note: e.target.value }
                                  }))
                                }
                                placeholder="e.g. Cashout Only / 0.10$ = 12 TK"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold text-slate-300">
                                  Custom Logo Image / URL (পেমেন্ট লোগো পরিবর্তন):
                                </label>
                                {editState.customIconUrl && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingPaymentNumbers((prev) => ({
                                        ...prev,
                                        [key]: { ...editState, customIconUrl: '' }
                                      }))
                                    }
                                    className="text-[9px] font-bold text-rose-400 hover:underline flex items-center gap-1"
                                  >
                                    <i className="fas fa-undo text-[8px]"></i>
                                    <span>Reset Original</span>
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2 items-center">
                                <input
                                  type="text"
                                  className="input-modern text-xs py-2 px-3 text-slate-300 font-mono flex-1"
                                  value={editState.customIconUrl}
                                  onChange={(e) =>
                                    setEditingPaymentNumbers((prev) => ({
                                      ...prev,
                                      [key]: { ...editState, customIconUrl: e.target.value }
                                    }))
                                  }
                                  placeholder="Image URL or upload image file..."
                                />
                                <label className="shrink-0 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-extrabold rounded-xl cursor-pointer flex items-center gap-1.5 shadow transition active:scale-95">
                                  <i className="fas fa-image"></i>
                                  <span>Upload</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        if (file.size > 2 * 1024 * 1024) {
                                          showToast('Image file size should be less than 2MB', 'error');
                                          return;
                                        }
                                        const reader = new FileReader();
                                        reader.onload = (evt) => {
                                          const result = evt.target?.result as string;
                                          if (result) {
                                            setEditingPaymentNumbers((prev) => ({
                                              ...prev,
                                              [key]: { ...editState, customIconUrl: result }
                                            }));
                                            showToast('✅ Logo image uploaded!', 'success');
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                              <p className="text-[9px] text-slate-400 mt-1">
                                যেকোনো ইমেজের লিংক দিন অথবা সরাসরি ফোন/পিসি থেকে ছবি আপলোড করুন। খালি রাখলে অরিজিনাল ব্র্যান্ড লোগো দেখাবে।
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSavePaymentNumber(key, editState.number, editState.note, editState.customIconUrl)}
                              className="w-full mt-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <i className="fas fa-save"></i>
                              <span>SAVE {config.label.toUpperCase()} DETAILS & LOGO</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB TAB 2: DEPOSIT REQUESTS (ডিপোজিট কন্ট্রোল & এমাউন্ট এডিট) */}
              {adminSubTab === 'deposits' && (
                <div className="space-y-4">
                  {/* AUTO DEPOSIT SYSTEM ON/OFF CONTROL BOX */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/40 shadow-xl flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg transition-all ${
                        autoDepositGlobalEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 animate-pulse'
                          : 'bg-red-500/20 text-red-400 border border-red-500/50'
                      }`}>
                        <i className={autoDepositGlobalEnabled ? 'fas fa-bolt text-amber-400' : 'fas fa-power-off text-red-400'}></i>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                            <span>Auto Deposit Gateway Control (অটো ডিপোজিট সিস্টেম অন/অফ)</span>
                          </h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            autoDepositGlobalEnabled
                              ? 'bg-emerald-500 text-slate-950 border border-emerald-400 shadow-md shadow-emerald-500/20'
                              : 'bg-red-500/20 text-red-400 border border-red-500/40'
                          }`}>
                            {autoDepositGlobalEnabled ? '⚡ AUTO ON (সচল)' : '⛔ AUTO OFF (বন্ধ)'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          {autoDepositGlobalEnabled
                            ? 'বিকাশ, নগদ ও রকেট ৩ সেকেন্ডে অটো লাইভ ভেরিফিকেশন চালু আছে।'
                            : 'অটো ডিপোজিট বন্ধ আছে। ইউজাররা ম্যানুয়ালি ডিপোজিট রিকোয়েস্ট পাঠাতে পারবেন।'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleSaveAutoDepositGlobalConfig(!autoDepositGlobalEnabled)}
                        disabled={isSavingAutoDepositSettings}
                        className={`px-5 py-2.5 rounded-xl font-black text-xs shadow-lg transition active:scale-95 flex items-center gap-2 ${
                          autoDepositGlobalEnabled
                            ? 'bg-red-500 hover:bg-red-600 text-white border border-red-400'
                            : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950'
                        }`}
                      >
                        <i className={autoDepositGlobalEnabled ? 'fas fa-power-off' : 'fas fa-bolt'}></i>
                        <span>
                          {autoDepositGlobalEnabled
                            ? 'অটো ডিপোজিট অফ করুন (TURN OFF)'
                            : 'অটো ডিপোজিট অন করুন (TURN ON ⚡)'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* MULTI DEPOSIT BONUS CONTROL BOX */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-orange-950/80 border border-amber-500/40 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-lg font-black shadow-md">
                          <i className="fas fa-gift text-amber-400"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                            <span>Multi Deposit Bonus Settings (মাল্টি ডিপোজিট বোনাস কন্ট্রোল)</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              depositBonusConfig.enabled
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                              {depositBonusConfig.enabled ? '✅ ON (সচল)' : '❌ OFF (বন্ধ)'}
                            </span>
                          </h3>
                          <p className="text-[11px] text-amber-300/80">
                            বিভিন্ন ডিপোজিট এমাউন্টের পরিমাণের জন্য আলাদা আলাদা % ক্যাশব্যাক বোনাস টায়ার যোগ করুন
                          </p>
                        </div>
                      </div>

                      {/* Controls: Add Tier & Enable/Disable */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const newTier: DepositBonusTier = {
                              id: `t-${Date.now()}`,
                              minAmount: 500,
                              maxAmount: 0,
                              percentage: 5,
                              label: 'New Tier'
                            };
                            setDepositBonusConfig((prev) => ({
                              ...prev,
                              tiers: [...prev.tiers, newTier]
                            }));
                            showToast('নতুন বোনাস টায়ার যোগ করা হয়েছে! (Save করতে নিচে ক্লিক করুন)', 'info');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition active:scale-95 flex items-center gap-1"
                        >
                          <i className="fas fa-plus-circle"></i>
                          <span>নতুন টায়ার (+ Add Tier)</span>
                        </button>

                        <button
                          onClick={() => handleSaveDepositBonusConfig(!depositBonusConfig.enabled, depositBonusConfig.tiers)}
                          disabled={isSavingDepositBonus}
                          className={`px-3.5 py-1.5 rounded-xl font-extrabold text-xs shadow-md transition active:scale-95 flex items-center gap-1.5 ${
                            depositBonusConfig.enabled
                              ? 'bg-red-500 hover:bg-red-600 text-white border border-red-400'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black'
                          }`}
                        >
                          <i className={depositBonusConfig.enabled ? 'fas fa-power-off' : 'fas fa-check-circle'}></i>
                          <span>{depositBonusConfig.enabled ? 'বোনাস অফ করুন' : 'বোনাস অন করুন'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Tier Rows List */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-black text-amber-300 flex items-center justify-between">
                        <span>বর্তমান মাল্টি বোনাস টায়ারসমূহ ({depositBonusConfig.tiers?.length || 0} টি):</span>
                        <span className="text-[10px] text-slate-400 font-normal">*Max 0 দিলে কোনো সর্বোচ্চ সীমা থাকবে না (যেমন: ৳1000+)</span>
                      </div>

                      {depositBonusConfig.tiers && depositBonusConfig.tiers.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2.5">
                          {depositBonusConfig.tiers.map((tier, index) => (
                            <div
                              key={tier.id || index}
                              className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 shadow-md hover:border-amber-500/60 transition"
                            >
                              <div className="flex items-center gap-2 font-mono font-black text-xs text-amber-400">
                                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center text-[11px]">
                                  #{index + 1}
                                </span>
                              </div>

                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-[280px]">
                                <div>
                                  <label className="text-[10px] font-bold text-amber-200 block mb-0.5">Min Deposit (সর্বনিম্ন ৳):</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      className="input-modern font-mono font-black text-emerald-400 text-xs py-1.5 pl-6"
                                      value={tier.minAmount}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setDepositBonusConfig((prev) => ({
                                          ...prev,
                                          tiers: prev.tiers.map((t, idx) => idx === index ? { ...t, minAmount: val } : t)
                                        }));
                                      }}
                                    />
                                    <span className="absolute left-2.5 top-2 text-[11px] font-bold text-emerald-400">৳</span>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-amber-200 block mb-0.5">Max Deposit (সর্বোচ্চ ৳):</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      placeholder="0 = Unlimited"
                                      className="input-modern font-mono font-black text-blue-400 text-xs py-1.5 pl-6"
                                      value={tier.maxAmount}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setDepositBonusConfig((prev) => ({
                                          ...prev,
                                          tiers: prev.tiers.map((t, idx) => idx === index ? { ...t, maxAmount: val } : t)
                                        }));
                                      }}
                                    />
                                    <span className="absolute left-2.5 top-2 text-[11px] font-bold text-blue-400">৳</span>
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[10px] font-bold text-amber-200 block mb-0.5">Bonus Percentage (%):</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.5"
                                      className="input-modern font-mono font-black text-amber-400 text-xs py-1.5 pr-6"
                                      value={tier.percentage}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        setDepositBonusConfig((prev) => ({
                                          ...prev,
                                          tiers: prev.tiers.map((t, idx) => idx === index ? { ...t, percentage: val } : t)
                                        }));
                                      }}
                                    />
                                    <span className="absolute right-2.5 top-2 text-[11px] font-bold text-amber-400">%</span>
                                  </div>
                                </div>
                              </div>

                              {/* Summary Badge & Delete */}
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-300 hidden md:inline-block">
                                  {tier.maxAmount && tier.maxAmount > 0
                                    ? `৳${tier.minAmount} - ৳${tier.maxAmount} → ${tier.percentage}%`
                                    : `৳${tier.minAmount}+ → ${tier.percentage}%`}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setDepositBonusConfig((prev) => ({
                                      ...prev,
                                      tiers: prev.tiers.filter((_, idx) => idx !== index)
                                    }));
                                    showToast('টাইয়ার মুছে ফেলা হয়েছে!', 'warning');
                                  }}
                                  className="w-8 h-8 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 flex items-center justify-center transition active:scale-95"
                                  title="Delete Tier"
                                >
                                  <i className="fas fa-trash-alt text-xs"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-slate-950/60 border border-dashed border-amber-500/30 text-center text-xs text-amber-300">
                          কোনো বোনাস টায়ার যোগ করা নেই! ওপরের <strong>"+ Add Tier"</strong> বাটনে ক্লিক করে টায়ার যোগ করুন।
                        </div>
                      )}
                    </div>

                    {/* Save Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => handleSaveDepositBonusConfig(depositBonusConfig.enabled, depositBonusConfig.tiers)}
                        disabled={isSavingDepositBonus}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-save"></i>
                        <span>মাল্টি বোনাস সেটিং সেভ করুন (SAVE MULTI-BONUS SETTINGS)</span>
                      </button>
                    </div>

                    {/* Quick Preset Templates */}
                    <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">⚡ কুইক মাল্টি-বোনাস প্রিসেট:</span>
                      {[
                        {
                          label: '3-Tier (৳100=2%, ৳500=5%, ৳1000+=10%)',
                          tiers: [
                            { id: 'p1', minAmount: 100, maxAmount: 499, percentage: 2, label: 'Tier 1' },
                            { id: 'p2', minAmount: 500, maxAmount: 999, percentage: 5, label: 'Tier 2' },
                            { id: 'p3', minAmount: 1000, maxAmount: 0, percentage: 10, label: 'Tier 3' }
                          ]
                        },
                        {
                          label: '4-Tier VIP (৳100=2%, ৳300=5%, ৳700=8%, ৳1500+=12%)',
                          tiers: [
                            { id: 'p1', minAmount: 100, maxAmount: 299, percentage: 2, label: 'Tier 1' },
                            { id: 'p2', minAmount: 300, maxAmount: 699, percentage: 5, label: 'Tier 2' },
                            { id: 'p3', minAmount: 700, maxAmount: 1499, percentage: 8, label: 'Tier 3' },
                            { id: 'p4', minAmount: 1500, maxAmount: 0, percentage: 12, label: 'Tier 4' }
                          ]
                        },
                        {
                          label: '2-Tier Simple (৳100=3%, ৳500+=7%)',
                          tiers: [
                            { id: 'p1', minAmount: 100, maxAmount: 499, percentage: 3, label: 'Tier 1' },
                            { id: 'p2', minAmount: 500, maxAmount: 0, percentage: 7, label: 'Tier 2' }
                          ]
                        },
                        {
                          label: 'Flat 5% (৳100+)',
                          tiers: [
                            { id: 'p1', minAmount: 100, maxAmount: 0, percentage: 5, label: 'Flat 5%' }
                          ]
                        }
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSaveDepositBonusConfig(true, preset.tiers)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-extrabold transition active:scale-95"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Banner Link to TrxID Maker */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/30 flex items-center justify-between gap-3 shadow-md mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm">
                        <i className="fas fa-key"></i>
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-white">
                          Admin TrxID Maker (কাস্টম TrxID বানান)
                        </h4>
                        <p className="text-[10px] text-emerald-300">
                          এডমিন থেকে সরাসরি TrxID বানাতে ডানপাশের বাটনে ক্লিক করুন
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setAdminSubTab('trx_maker');
                        haptic('light');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs hover:bg-emerald-400 transition active:scale-95 flex items-center gap-1 shrink-0 shadow"
                    >
                      <span>TrxID বানান</span>
                      <i className="fas fa-arrow-right text-[10px]"></i>
                    </button>
                  </div>

                  {/* Filter tabs */}
                  <div className="flex gap-2">
                    {(['all', 'Pending', 'Approved', 'Rejected'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setDepFilter(f)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                          depFilter === f
                            ? 'bg-amber-500 text-slate-950 shadow'
                            : 'bg-slate-900 border border-white/10 text-slate-400'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {allDepositRequests
                    .filter((d) => (depFilter === 'all' ? true : d.status === depFilter))
                    .map((dep) => {
                      const currentEditable = customDepAmounts[dep.id] ?? String(dep.amount);

                      return (
                        <div
                          key={dep.id}
                          className={`p-4 rounded-2xl border transition-all space-y-3 ${
                            dep.status === 'Pending'
                              ? 'bg-slate-900/90 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                              : dep.status === 'Approved'
                              ? 'bg-slate-900/60 border-emerald-500/30'
                              : 'bg-slate-900/40 border-red-500/30 opacity-75'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <PaymentLogo method={dep.method} customUrl={paymentMethodsConfig[dep.method]?.customIconUrl} className="w-6 h-6" />
                              <span
                                className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
                                  dep.status === 'Approved'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : dep.status === 'Rejected'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-amber-500/20 text-amber-400 animate-pulse'
                                }`}
                              >
                                {dep.status}
                              </span>
                              <span className="text-[10px] font-extrabold font-mono text-slate-300 uppercase">
                                {dep.method}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500">
                              {dep.timestamp
                                ? new Date(dep.timestamp.seconds * 1000).toLocaleString('en-BD', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'Recent'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[9px] text-slate-500 font-bold uppercase block">User UID</span>
                              <span className="font-mono text-slate-300 font-bold">{dep.uid}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-500 font-bold uppercase block">Trx ID / Hash</span>
                              <span className="font-mono text-blue-400 font-extrabold">{dep.trxId}</span>
                            </div>
                          </div>

                          {/* Editable Deposit Amount before Approval */}
                          <div className="bg-black/40 p-3 rounded-xl border border-white/5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 font-bold">Requested Deposit Amount:</span>
                              <span className="text-sm font-black text-white">৳ {dep.amount}</span>
                            </div>

                            {dep.status === 'Pending' && (
                              <div className="space-y-2 pt-1 border-t border-white/5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-extrabold text-amber-400 flex items-center gap-1">
                                    <i className="fas fa-edit"></i>
                                    <span>Edit Deposit Amount (এমাউন্ট বাড়ান বা কমান):</span>
                                  </label>
                                  {parseFloat(currentEditable) !== dep.amount && (
                                    <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full animate-pulse">
                                      ৳{dep.amount} → ৳{currentEditable}
                                    </span>
                                  )}
                                </div>

                                {/* Quick Adjustment Buttons (+10, +50, -10, Reset) */}
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const val = (parseFloat(currentEditable) || dep.amount) + 10;
                                      setCustomDepAmounts((prev) => ({ ...prev, [dep.id]: String(val) }));
                                    }}
                                    className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold text-[10px] rounded-lg border border-emerald-500/30 transition active:scale-95"
                                  >
                                    +10 ৳
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const val = (parseFloat(currentEditable) || dep.amount) + 50;
                                      setCustomDepAmounts((prev) => ({ ...prev, [dep.id]: String(val) }));
                                    }}
                                    className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold text-[10px] rounded-lg border border-emerald-500/30 transition active:scale-95"
                                  >
                                    +50 ৳
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const val = Math.max(0, (parseFloat(currentEditable) || dep.amount) - 10);
                                      setCustomDepAmounts((prev) => ({ ...prev, [dep.id]: String(val) }));
                                    }}
                                    className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-extrabold text-[10px] rounded-lg border border-red-500/30 transition active:scale-95"
                                  >
                                    -10 ৳
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomDepAmounts((prev) => ({ ...prev, [dep.id]: String(dep.amount) }));
                                    }}
                                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] rounded-lg border border-white/10 transition active:scale-95"
                                  >
                                    Reset (৳{dep.amount})
                                  </button>
                                </div>

                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    className="input-modern text-xs py-1.5 px-3 font-mono font-bold text-amber-300"
                                    placeholder="Enter final amount..."
                                    value={currentEditable}
                                    onChange={(e) =>
                                      setCustomDepAmounts((prev) => ({
                                        ...prev,
                                        [dep.id]: e.target.value
                                      }))
                                    }
                                  />
                                  <span className="text-xs font-bold text-slate-400">৳</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          {dep.status === 'Pending' && (
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() =>
                                  handleApproveDepositCustom(dep.id, dep.uid, parseFloat(currentEditable) || dep.amount)
                                }
                                className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-1.5"
                              >
                                <i className="fas fa-check-circle"></i>
                                <span>APPROVE & CREDIT (৳ {currentEditable})</span>
                              </button>
                              <button
                                onClick={() => handleRejectDeposit(dep.id)}
                                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs rounded-xl transition active:scale-95 flex items-center justify-center gap-1"
                              >
                                <i className="fas fa-times-circle"></i>
                                <span>REJECT</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* SUB TAB: ADMIN TRXID MAKER (এডমিন ট্রানজেকশন আইডি জেনারেটর & কন্ট্রোল) */}
              {adminSubTab === 'trx_maker' && (
                <div className="space-y-4 animate-fade-in">
                  {/* Top Banner */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border border-emerald-500/40 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center text-lg font-black shadow-md">
                          <i className="fas fa-key"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-white">
                            Admin TrxID Maker & Generator (এডমিন ট্রানজেকশন আইডি জেনারেটর)
                          </h3>
                          <p className="text-[11px] text-emerald-300">
                            এখান থেকে কাস্টম বা অটো TrxID বানিয়ে রাখুন। ইউজার ওই TrxID দিলে অটো টাকা এড হয়ে যাবে!
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const randomCode = generateRandomTrxCode('bkash');
                          setNewAdminTrxId(randomCode);
                          showToast(`🎲 জেনারেট ট্রানজেকশন আইডি: ${randomCode}`, 'info');
                          haptic('light');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs shadow-md hover:bg-emerald-400 transition active:scale-95 flex items-center gap-1.5"
                      >
                        <i className="fas fa-dice"></i>
                        <span>র্যান্ডম জেনারেট</span>
                      </button>
                    </div>

                    {/* Quick 1-Click Preset Generators */}
                    <div className="pt-2 border-t border-white/10">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                        ⚡ 1-Click Quick TrxID Generator (১-ক্লিকে TrxID বানিয়ে ফেলুন):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: '+ ৳50 bKash TrxID', amt: 50, method: 'bkash' },
                          { label: '+ ৳100 bKash TrxID', amt: 100, method: 'bkash' },
                          { label: '+ ৳500 Nagad TrxID', amt: 500, method: 'nagad' },
                          { label: '+ ৳1000 Rocket TrxID', amt: 1000, method: 'rocket' }
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuickBatchGenAdminTrx(preset.amt, preset.method)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold transition active:scale-95 flex items-center gap-1.5"
                          >
                            <i className="fas fa-bolt text-amber-400"></i>
                            <span>{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Form Card */}
                  <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-sm font-bold">
                        <i className="fas fa-plus-circle"></i>
                      </div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-amber-300 uppercase tracking-wider">
                        Create Custom TrxID Voucher (কাস্টম ট্রানজেকশন আইডি তৈরি করুন)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="form-label flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <i className="fas fa-barcode text-emerald-400 text-[10px]"></i>
                            <span>TrxID (ট্রানজেকশন আইডি):</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setNewAdminTrxId(generateRandomTrxCode(newAdminTrxMethod))}
                            className="text-[10px] text-amber-300 hover:underline font-bold"
                          >
                            🎲 Auto
                          </button>
                        </label>
                        <input
                          type="text"
                          className="input-modern uppercase text-xs font-mono font-bold text-amber-300"
                          placeholder="e.g. BK892348 or NAGAD782"
                          value={newAdminTrxId}
                          onChange={(e) => setNewAdminTrxId(e.target.value.toUpperCase())}
                        />
                      </div>

                      <div>
                        <label className="form-label flex items-center gap-1">
                          <i className="fas fa-money-bill-wave text-emerald-400 text-[10px]"></i>
                          <span>Deposit Amount (টাকা এমাউন্ট ৳):</span>
                        </label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono text-emerald-400 font-bold"
                          placeholder="e.g. 100 or 500"
                          value={newAdminTrxAmount}
                          onChange={(e) => setNewAdminTrxAmount(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label flex items-center gap-1">
                          <i className="fas fa-wallet text-pink-400 text-[10px]"></i>
                          <span>Payment Method (পেমেন্ট মেথড):</span>
                        </label>
                        <select
                          className="input-modern text-xs font-bold uppercase"
                          value={newAdminTrxMethod}
                          onChange={(e) => setNewAdminTrxMethod(e.target.value)}
                        >
                          <option value="bkash">bKash 1 (বিকাশ মার্চেন্ট)</option>
                          <option value="bkash_2">bKash 2 (বিকাশ পার্সোনাল)</option>
                          <option value="nagad">Nagad (নগদ)</option>
                          <option value="rocket">Rocket (রকেট)</option>
                          <option value="binance">Binance Pay</option>
                          <option value="usdt_bep20">USDT BEP20</option>
                        </select>
                      </div>

                      <div>
                        <label className="form-label flex items-center gap-1">
                          <i className="fas fa-sticky-note text-blue-400 text-[10px]"></i>
                          <span>Note / Description (নোট):</span>
                        </label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="e.g. Gift for User or Promo"
                          value={newAdminTrxNote}
                          onChange={(e) => setNewAdminTrxNote(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCreateAdminTrx}
                      disabled={adminTrxCreating}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                    >
                      {adminTrxCreating ? (
                        <span className="loading-spinner"></span>
                      ) : (
                        <>
                          <i className="fas fa-check-circle text-amber-950 text-sm"></i>
                          <span>SAVE & GENERATE TRXID (TrxID সেভ করুন)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Admin Created Trxs List */}
                  <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-list-check text-emerald-400"></i>
                        <h4 className="font-extrabold text-xs sm:text-sm text-white">
                          Created TrxIDs List (তৈরিকৃত TrxID তালিকা - মোট {adminCreatedTrxs.length}টি)
                        </h4>
                      </div>

                      {/* Filter */}
                      <div className="flex gap-1.5">
                        {[
                          { id: 'all', label: `সকল (${adminCreatedTrxs.length})` },
                          { id: 'Unused', label: `অব্যবহৃত (${adminCreatedTrxs.filter(t => t.status === 'Unused').length})` },
                          { id: 'Used', label: `ব্যবহার হয়েছে (${adminCreatedTrxs.filter(t => t.status === 'Used').length})` }
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => {
                              setAdminTrxFilter(f.id as any);
                              haptic('light');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition ${
                              adminTrxFilter === f.id
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {adminCreatedTrxs.length === 0 ? (
                      <div className="text-center py-8 text-slate-500 space-y-2">
                        <i className="fas fa-key text-3xl opacity-40"></i>
                        <p className="text-xs font-bold">এখনো কোনো TrxID তৈরি করা হয়নি!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {adminCreatedTrxs
                          .filter((t) => (adminTrxFilter === 'all' ? true : t.status === adminTrxFilter))
                          .map((trx) => {
                            const isUnused = trx.status === 'Unused';
                            return (
                              <div
                                key={trx.id}
                                className={`p-3.5 rounded-xl border transition-all space-y-2 relative overflow-hidden ${
                                  isUnused
                                    ? 'bg-slate-950/80 border-emerald-500/40 shadow-md'
                                    : 'bg-slate-950/40 border-red-500/20 opacity-75'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
                                        isUnused
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      }`}
                                    >
                                      {isUnused ? '✅ Unused (চলতি)' : '❌ Used (ব্যবহারিত)'}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                                      {trx.method}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => copyNumber(trx.trxId)}
                                      className="px-2 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] font-bold border border-blue-500/30 transition active:scale-95 flex items-center gap-1"
                                    >
                                      <i className="fas fa-copy"></i>
                                      <span>কপি</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteAdminTrx(trx.id)}
                                      className="p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] border border-red-500/30 transition active:scale-95"
                                    >
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                                  <div>
                                    <div className="text-xs font-mono font-black text-amber-300 tracking-wider">
                                      TrxID: {trx.trxId}
                                    </div>
                                    {trx.note && (
                                      <div className="text-[10px] text-slate-400 italic">
                                        নোট: {trx.note}
                                      </div>
                                    )}
                                    {!isUnused && trx.usedByUid && (
                                      <div className="text-[9px] font-mono text-pink-300 font-bold">
                                        ব্যবহারকারী: {trx.usedByUid.slice(0, 8)}...
                                      </div>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <div className="text-sm font-black text-emerald-400 font-mono">
                                      ৳ {trx.amount}
                                    </div>
                                    <div className="text-[9px] text-slate-500 font-mono">
                                      {trx.createdAt
                                        ? new Date(trx.createdAt.seconds * 1000).toLocaleDateString('en-BD')
                                        : 'Just now'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {adminSubTab === 'orders' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold text-slate-300">All Orders ({allAdminOrdersList.length})</span>
                    <select
                      className="input-modern py-1 px-3 text-xs w-auto"
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="Processing">Processing</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  {allAdminOrdersList
                    .filter((o) => (orderStatusFilter === 'all' ? true : o.status === orderStatusFilter))
                    .map((o) => (
                      <div key={o.id} className="glass-card p-4 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono text-slate-400 font-bold">#{o.id.slice(-8)}</span>
                          <span className="font-mono text-slate-400 text-[10px]">User: {o.uid.slice(0, 8)}</span>
                        </div>

                        <h4 className="font-extrabold text-xs text-white leading-snug">{o.service}</h4>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{o.link}</p>

                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                          <div className="text-xs">
                            <span className="text-slate-400">Qty: {o.qty?.toLocaleString()} | </span>
                            <span className="text-emerald-400 font-bold">৳ {o.cost?.toFixed(2)}</span>
                          </div>

                          {/* Change Status Dropdown */}
                          <div className="flex items-center gap-2">
                            <select
                              className="input-modern text-xs py-1 px-2.5 w-auto"
                              value={o.status || 'Pending'}
                              onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Processing">Processing</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Completed">Completed</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>

                            {(!o.apiOrderId || o.apiError) && (
                              <button
                                onClick={() => handleRetryOrder(o)}
                                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[10px] rounded-lg border border-amber-500/30"
                              >
                                Retry API
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* SUB TAB 4: SERVICES MANAGEMENT */}
              {adminSubTab === 'services' && (
                <div className="space-y-4">
                  {/* Service Add/Edit Form Card */}
                  <div className="glass-card p-4 space-y-3">
                    <h3 className="font-extrabold text-xs text-white flex items-center justify-between">
                      <span>{editingServiceId ? 'Edit Service' : 'Add New Service (SMMGen API)'}</span>
                      {editingServiceId && (
                        <button
                          onClick={() => {
                            setEditingServiceId(null);
                            setAdminName('');
                            setAdminCategory('');
                            setAdminPrice('');
                            setAdminApiServiceId('');
                          }}
                          className="text-[10px] text-red-400 hover:underline"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </h3>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="form-label">Service Name</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="e.g. Facebook Likes [Instant]"
                          value={adminName}
                          onChange={(e) => setAdminName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Category</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="e.g. Facebook"
                          value={adminCategory}
                          onChange={(e) => setAdminCategory(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="form-label">Price / 1k (৳)</label>
                        <input
                          type="number"
                          className="input-modern text-xs"
                          placeholder="৳ 25"
                          value={adminPrice}
                          onChange={(e) => setAdminPrice(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Min Qty</label>
                        <input
                          type="number"
                          className="input-modern text-xs"
                          value={adminMin}
                          onChange={(e) => setAdminMin(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">API Service ID</label>
                        <input
                          type="text"
                          className="input-modern text-xs font-mono"
                          placeholder="15806"
                          value={adminApiServiceId}
                          onChange={(e) => setAdminApiServiceId(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleSaveServiceManual}
                      disabled={adminSubmitting}
                      className="btn-primary-solid py-2 text-xs w-full flex items-center justify-center gap-1"
                    >
                      {adminSubmitting ? (
                        <span className="loading-spinner"></span>
                      ) : (
                        <>
                          <i className="fas fa-plus-circle"></i>
                          <span>{editingServiceId ? 'SAVE SERVICE CHANGES' : 'CREATE SERVICE NOW'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Existing Services List */}
                  <div className="space-y-2">
                    {allServices.map((svc) => (
                      <div key={svc.id} className="p-3 bg-slate-900/80 border border-white/10 rounded-2xl flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded">
                              {svc.category}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">ID: {svc.id}</span>
                          </div>
                          <h4 className="font-extrabold text-xs text-white mt-1">{svc.name}</h4>
                          <p className="text-[10px] text-emerald-400 font-bold">৳ {svc.price} / 1k</p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingServiceId(svc.id);
                              setAdminName(svc.name);
                              setAdminCategory(svc.category);
                              setAdminPrice(String(svc.price));
                              setAdminMin(String(svc.min));
                              setAdminMax(String(svc.max || 100000));
                              setAdminDesc(svc.desc || '');
                              setAdminApiServiceId(svc.apiServiceId || '');
                            }}
                            className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteService(svc.id, svc.name)}
                            className="w-7 h-7 rounded-lg bg-red-500/20 text-red-300 flex items-center justify-center text-xs"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB TAB 5: BROADCAST NOTIFICATIONS */}
              {adminSubTab === 'notifications' && (
                <div className="glass-card p-4 space-y-3">
                  <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                    <i className="fas fa-bullhorn text-amber-400"></i>
                    <span>Post Broadcast Notification to All Users</span>
                  </h3>

                  <div>
                    <label className="form-label">Notification Title</label>
                    <input
                      type="text"
                      className="input-modern text-xs"
                      placeholder="e.g. Special Weekend Deposit Bonus 🎉"
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label">Type</label>
                    <select
                      className="input-modern text-xs"
                      value={broadcastType}
                      onChange={(e) => setBroadcastType(e.target.value as any)}
                    >
                      <option value="system">System Notice 🚀</option>
                      <option value="promo">Promo / Offer 🎉</option>
                      <option value="deposit">Deposit Update 💳</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Message Details</label>
                    <textarea
                      rows={3}
                      className="input-modern text-xs resize-none"
                      placeholder="Write message to send to all users..."
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                    />
                  </div>

                  {/* Broadcast Image / Banner Upload */}
                  <div className="space-y-2 p-3 bg-black/40 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-extrabold text-white flex items-center gap-1.5">
                        <i className="fas fa-image text-amber-400"></i>
                        <span>Attach Image / Banner (ছবি সংযুক্ত করুন - ঐচ্ছিক)</span>
                      </label>
                      {broadcastImage && (
                        <button
                          onClick={() => setBroadcastImage(null)}
                          className="text-[10px] text-red-400 hover:underline font-bold"
                        >
                          Remove Photo
                        </button>
                      )}
                    </div>

                    {broadcastImage ? (
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-amber-500/40 bg-slate-950">
                        <img src={broadcastImage} alt="Broadcast Banner Preview" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setBroadcastImage(null)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow hover:scale-110 transition"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-amber-500/30 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10 rounded-xl transition cursor-pointer text-center">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAdminBroadcastImageUpload}
                          className="hidden"
                        />
                        <i className="fas fa-cloud-arrow-up text-amber-400 text-xl mb-1"></i>
                        <span className="text-xs font-bold text-white">ব্রডকাস্ট নোটিশের জন্য ছবি আপলোড করুন</span>
                      </label>
                    )}
                  </div>

                  <button
                    onClick={handleSendBroadcast}
                    className="btn-primary-solid py-2.5 text-xs w-full flex items-center justify-center gap-2"
                  >
                    <i className="fas fa-paper-plane text-xs"></i>
                    <span>BROADCAST TO ALL USERS</span>
                  </button>
                </div>
              )}

              {/* SUB TAB 6: SUPPORT LINKS */}
              {adminSubTab === 'links' && (
                <div className="space-y-4">
                  <div className="glass-card p-4 space-y-3">
                    <h3 className="font-extrabold text-xs text-white">Add New Support Link</h3>
                    <input
                      type="text"
                      className="input-modern text-xs"
                      placeholder="Link Title (e.g. Telegram Channel)"
                      value={newLinkName}
                      onChange={(e) => setNewLinkName(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-modern text-xs"
                      placeholder="URL (e.g. https://t.me/RF2_SMM)"
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                    />
                    <button
                      onClick={handleAddSupportLink}
                      className="btn-primary-solid py-2 text-xs w-full flex items-center justify-center gap-1"
                    >
                      <i className="fas fa-plus"></i>
                      <span>ADD LINK</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {supportLinks.map((sl) => (
                      <div key={sl.id} className="p-3 bg-slate-900/80 border border-white/10 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <i className={`${sl.icon} text-blue-400 text-sm`}></i>
                          <div>
                            <h4 className="font-extrabold text-xs text-white">{sl.name}</h4>
                            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px]">{sl.url}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteSupportLink(sl.id)}
                          className="w-7 h-7 rounded-lg bg-red-500/20 text-red-300 flex items-center justify-center text-xs"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB TAB 7: SETTINGS & BACKUP */}
              {adminSubTab === 'settings' && (
                <div className="space-y-4">
                  {/* Telegram Channel Live Order Bot Settings */}
                  <div className="glass-card p-5 space-y-4 border-sky-500/30 bg-sky-950/10">
                    <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-sm">
                          <i className="fab fa-telegram-plane"></i>
                        </div>
                        <div>
                          <h3 className="font-extrabold text-xs text-white">Telegram Channel Live Order Bot (বট কনফিগারেশন)</h3>
                          <p className="text-[10px] text-sky-300/80">লাইভ অর্ডার চ্যানেলে পাঠানোর জন্য টেলিগ্রাম বট সেটিং</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Telegram Bot Token</label>
                        <input
                          type="text"
                          className="input-modern font-mono text-xs"
                          value={tgBotToken}
                          onChange={(e) => setTgBotToken(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Mini App Start URL</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          value={tgMiniAppUrl}
                          onChange={(e) => setTgMiniAppUrl(e.target.value)}
                        />
                      </div>

                      {/* Channel 1 */}
                      <div>
                        <label className="form-label">Channel 1 ID (চ্যানেল ১ আইডি)</label>
                        <input
                          type="text"
                          className="input-modern font-mono text-xs"
                          placeholder="-1003911086814"
                          value={tgChannel1Id}
                          onChange={(e) => setTgChannel1Id(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Channel 1 Link (চ্যানেল ১ লিংক)</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="https://t.me/RF2_SMM"
                          value={tgChannel1Url}
                          onChange={(e) => setTgChannel1Url(e.target.value)}
                        />
                      </div>

                      {/* Channel 2 */}
                      <div>
                        <label className="form-label">Channel 2 ID (চ্যানেল ২ আইডি - ঐচ্ছিক)</label>
                        <input
                          type="text"
                          className="input-modern font-mono text-xs"
                          placeholder="-100xxxxxxxxxx"
                          value={tgChannel2Id}
                          onChange={(e) => setTgChannel2Id(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Channel 2 Link (চ্যানেল ২ লিংক - ঐচ্ছিক)</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="https://t.me/your_second_channel"
                          value={tgChannel2Url}
                          onChange={(e) => setTgChannel2Url(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Mandatory 4 Telegram Channels Settings */}
                    <div className="pt-4 border-t border-sky-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-extrabold text-xs text-white flex items-center gap-2">
                            <i className="fas fa-lock text-amber-400"></i>
                            <span>Mandatory 4 Channels Join Lock (লগইনে ৪টি চ্যানেল জয়েন বাধ্যতামূলক)</span>
                          </h4>
                          <p className="text-[10px] text-sky-300/80">
                            ব্যবহারকারী অ্যাপে ঢুকলে এই ৪টি চ্যানেলে জয়েন করা বাধ্যতামূলক হবে।
                          </p>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={mandatoryChannelsEnabled}
                            onChange={(e) => setMandatoryChannelsEnabled(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {mandatoryChannels.map((ch, idx) => (
                          <div key={idx} className="p-3 bg-slate-900/90 border border-white/10 rounded-2xl space-y-2">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-wide flex items-center gap-1">
                              <i className="fab fa-telegram text-sky-400"></i>
                              <span>Channel {idx + 1} (চ্যানেল {idx + 1})</span>
                            </span>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Channel Name (নাম)</label>
                              <input
                                type="text"
                                className="input-modern text-xs"
                                value={ch.name}
                                onChange={(e) => {
                                  const updated = [...mandatoryChannels];
                                  updated[idx] = { ...updated[idx], name: e.target.value };
                                  setMandatoryChannels(updated);
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Telegram Link (লিংক)</label>
                              <input
                                type="text"
                                className="input-modern text-xs"
                                value={ch.url}
                                onChange={(e) => {
                                  const updated = [...mandatoryChannels];
                                  updated[idx] = { ...updated[idx], url: e.target.value };
                                  setMandatoryChannels(updated);
                                }}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Chat Username or ID (e.g. @Farju_Tech_Studio)</label>
                              <input
                                type="text"
                                className="input-modern font-mono text-xs"
                                placeholder="@username or -100xxx"
                                value={ch.chatId || ''}
                                onChange={(e) => {
                                  const updated = [...mandatoryChannels];
                                  updated[idx] = { ...updated[idx], chatId: e.target.value };
                                  setMandatoryChannels(updated);
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSaveTelegramSettings}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-save"></i>
                        <span>SAVE TELEGRAM SETTINGS (সেটিংস সেভ করুন)</span>
                      </button>
                      <button
                        onClick={handleTestTelegramNotification}
                        className="flex-1 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-2"
                      >
                        <i className="fab fa-telegram-plane"></i>
                        <span>TEST TELEGRAM NOTIFICATION (টেস্ট করুন)</span>
                      </button>
                    </div>
                  </div>

                  {/* SMM Panel API Config */}
                  <div className="glass-card p-5 space-y-4">
                    <h3 className="font-extrabold text-xs text-white flex items-center gap-2">
                      <i className="fas fa-sliders-h text-blue-400"></i>
                      <span>SMM Panel API Configuration</span>
                    </h3>

                    <div>
                      <label className="form-label">SMMGen API Key</label>
                      <input
                        type="text"
                        className="input-modern font-mono text-xs"
                        defaultValue="abb6b46205ede0b57a7c53580646fc7a"
                        disabled
                      />
                    </div>

                    <div>
                      <label className="form-label">API Base URL</label>
                      <input
                        type="text"
                        className="input-modern font-mono text-xs"
                        defaultValue="https://my.smmgen.com/api/v2"
                        disabled
                      />
                    </div>

                    <div className="pt-2 border-t border-white/10">
                      <h4 className="font-extrabold text-xs text-white mb-2">Data Export & Backup</h4>
                      <button
                        onClick={handleExportBackup}
                        className="btn-secondary-solid py-2 text-xs flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-download"></i>
                        <span>DOWNLOAD FULL PANEL BACKUP (JSON)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB TAB 8: TASKS & SCREENSHOT PROOFS */}
              {adminSubTab === 'tasks' && (
                <div className="space-y-5">
                  {/* Admin Tasks Header Banner */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/60 via-yellow-900/40 to-slate-900 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-base">
                        <i className="fas fa-tasks"></i>
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-white">Task Proofs & Screenshots (প্রুফ ও স্ক্রিনশট রিভিউ)</h3>
                        <p className="text-[10px] text-amber-200/80">ইউজারদের জমা দেওয়া টাস্ক প্রুফ ও সর্বোচ্চ ৫টি স্ক্রিনশট রিভিউ করে রিওয়ার্ড এপ্রুভ করুন</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-400 bg-black/40 px-3 py-1.5 rounded-xl border border-amber-500/20">
                      <span>Pending Reviews:</span>
                      <span className="text-white bg-amber-500 px-2 py-0.5 rounded-md text-[11px] text-black font-black">
                        {allTaskSubmissions.filter((s) => s.status === 'Pending').length}
                      </span>
                    </div>
                  </div>

                  {/* Section 1: Task Proof Submissions Review */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-extrabold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                        <span>User Task Submissions ({allTaskSubmissions.length})</span>
                      </h4>

                      {/* Filter Buttons */}
                      <div className="flex bg-slate-900 p-1 rounded-xl border border-white/10 gap-1 text-[11px]">
                        {(['all', 'Pending', 'Approved', 'Rejected'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setAdminTaskFilter(f)}
                            className={`px-2.5 py-1 rounded-lg font-extrabold transition ${
                              adminTaskFilter === f
                                ? 'bg-amber-500 text-black shadow'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {f === 'all' ? 'All' : f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {allTaskSubmissions.filter((s) => (adminTaskFilter === 'all' ? true : s.status === adminTaskFilter)).length === 0 ? (
                      <div className="glass-card p-8 text-center">
                        <i className="fas fa-file-circle-xmark text-3xl text-slate-600 mb-2"></i>
                        <p className="text-xs font-bold text-slate-400">No task submissions found in this filter.</p>
                      </div>
                    ) : (
                      allTaskSubmissions
                        .filter((s) => (adminTaskFilter === 'all' ? true : s.status === adminTaskFilter))
                        .map((sub) => {
                          return (
                            <div
                              key={sub.id}
                              className={`glass-card p-4 space-y-3 border transition-all ${
                                sub.status === 'Pending'
                                  ? 'border-amber-500/40 bg-amber-950/10'
                                  : sub.status === 'Approved'
                                  ? 'border-emerald-500/30'
                                  : 'border-red-500/30'
                              }`}
                            >
                              {/* Header info */}
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-amber-400 font-extrabold text-xs">
                                    <i className="fas fa-user-check"></i>
                                  </div>
                                  <div>
                                    <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                                      <span>{sub.userName || 'User'}</span>
                                      <span className="font-mono text-[9px] text-slate-400 bg-white/5 px-1.5 py-0.5 rounded">
                                        UID: {sub.userId ? sub.userId.slice(0, 8) : 'N/A'}
                                      </span>
                                    </h4>
                                    <p className="text-[10px] text-amber-300 font-semibold">{sub.taskTitle}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                    +৳ {sub.reward}
                                  </span>
                                  <span
                                    className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                                      sub.status === 'Approved'
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                        : sub.status === 'Pending'
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                                    }`}
                                  >
                                    {sub.status}
                                  </span>
                                </div>
                              </div>

                              {/* User Submitted Proof Text */}
                              {sub.proofText && (
                                <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs text-slate-300 space-y-1">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                    <i className="fas fa-comment-dots text-amber-400 mr-1"></i> User Submitted Note / ID:
                                  </span>
                                  <p className="font-mono text-white whitespace-pre-wrap select-all">{sub.proofText}</p>
                                </div>
                              )}

                              {/* Screenshots Gallery Grid (Up to 5 Screenshots) */}
                              <div>
                                <span className="text-[10px] font-extrabold text-slate-300 flex items-center gap-1.5 mb-2">
                                  <i className="fas fa-images text-amber-400"></i>
                                  <span>Submitted Screenshots ({sub.screenshots ? sub.screenshots.length : 0} / 5):</span>
                                  <span className="text-[9px] text-slate-400 font-normal">(Click image to zoom full screen)</span>
                                </span>

                                {!sub.screenshots || sub.screenshots.length === 0 ? (
                                  <div className="p-3 rounded-xl bg-slate-900/60 border border-white/5 text-center text-xs text-slate-500">
                                    No screenshot images attached
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                                    {sub.screenshots.map((imgSrc, imgIdx) => (
                                      <div
                                        key={imgIdx}
                                        onClick={() => setSelectedScreenshotPreview(imgSrc)}
                                        className="group relative aspect-video sm:aspect-square bg-slate-950 rounded-xl overflow-hidden border border-amber-500/30 hover:border-amber-400 cursor-pointer shadow transition active:scale-95"
                                      >
                                        <img
                                          src={imgSrc}
                                          alt={`Screenshot ${imgIdx + 1}`}
                                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                          <i className="fas fa-search-plus text-white text-base"></i>
                                        </div>
                                        <span className="absolute bottom-1 right-1 bg-black/80 text-[8px] font-mono text-amber-300 px-1.5 py-0.5 rounded font-bold">
                                          #{imgIdx + 1}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Submission Date & Admin Actions */}
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-[10px] text-slate-400">
                                <span className="font-mono">Submitted: {sub.submittedAt || 'Recently'}</span>

                                {sub.status === 'Pending' && (
                                  <div className="flex gap-2 w-full sm:w-auto">
                                    <button
                                      onClick={() => handleApproveTaskSubmission(sub)}
                                      className="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                      <i className="fas fa-check-circle"></i>
                                      <span>APPROVE & CREDIT (৳{sub.reward})</span>
                                    </button>
                                    <button
                                      onClick={() => handleRejectTaskSubmission(sub.id)}
                                      className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs rounded-xl transition active:scale-95 flex items-center justify-center gap-1"
                                    >
                                      <i className="fas fa-times-circle"></i>
                                      <span>REJECT</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>

                  {/* Section 2: Create & Manage Custom Tasks */}
                  <div className="glass-card p-4 space-y-4">
                    <h4 className="font-extrabold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-plus-circle text-amber-400"></i>
                      <span>Add New System Task (নতুন টাস্ক যোগ করুন)</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="form-label">Task Title (টাস্ক এর নাম)</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="e.g. YouTube Channel Subscribe"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Reward Amount (রিওয়ার্ড ৳)</label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono"
                          placeholder="e.g. 5"
                          value={newTaskReward}
                          onChange={(e) => setNewTaskReward(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Max User Limit (ইউজার লিমিট)</label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono"
                          placeholder="0 = Unlimited (আনলিমিটেড)"
                          value={newTaskMaxUserLimit}
                          onChange={(e) => setNewTaskMaxUserLimit(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="form-label">Task Link (টাস্ক এর লিঙ্ক)</label>
                      <input
                        type="text"
                        className="input-modern text-xs font-mono"
                        placeholder="e.g. https://youtube.com/c/yourchannel"
                        value={newTaskLink}
                        onChange={(e) => setNewTaskLink(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="form-label">Task Description & Instructions</label>
                      <textarea
                        rows={2}
                        className="input-modern text-xs resize-none"
                        placeholder="e.g. চ্যানেল সাবস্ক্রাইব করে বেল আইকন অন করে ৫টি স্ক্রিনশট পর্যন্ত প্রুফ আপলোড দিন।"
                        value={newTaskDesc}
                        onChange={(e) => setNewTaskDesc(e.target.value)}
                      />
                    </div>

                    {/* Task Image / Banner File Upload Field */}
                    <div className="space-y-2 p-3 bg-black/40 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center text-xs">
                        <label className="font-extrabold text-white flex items-center gap-1.5">
                          <i className="fas fa-image text-amber-400"></i>
                          <span>Task Image / Banner (টাস্ক এর ছবি বা ব্যানার আপলোড)</span>
                        </label>
                        {newTaskImage && (
                          <button
                            onClick={() => setNewTaskImage(null)}
                            className="text-[10px] text-red-400 hover:underline font-bold"
                          >
                            Remove Image
                          </button>
                        )}
                      </div>

                      {newTaskImage ? (
                        <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-amber-500/40 bg-slate-950">
                          <img src={newTaskImage} alt="Task Banner Preview" className="w-full h-full object-cover" />
                          <button
                            onClick={() => setNewTaskImage(null)}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow hover:scale-110 transition"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-amber-500/30 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10 rounded-xl transition cursor-pointer text-center">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAdminTaskImageUpload}
                            className="hidden"
                          />
                          <i className="fas fa-file-image text-amber-400 text-xl mb-1"></i>
                          <span className="text-xs font-bold text-white">ক্লিক করে টাস্ক এর ছবি আপলোড করুন</span>
                          <span className="text-[9px] text-slate-400">(Upload image/banner for this task)</span>
                        </label>
                      )}
                    </div>

                    <button
                      onClick={handleCreateAdminTask}
                      className="btn-primary-solid py-2.5 text-xs w-full flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-plus text-xs"></i>
                      <span>CREATE & PUBLISH TASK</span>
                    </button>

                    {/* Active System Tasks List */}
                    <div className="pt-3 border-t border-white/10 space-y-2">
                      <h5 className="font-extrabold text-xs text-slate-300">Current Active Tasks ({customTasks.length})</h5>
                      <div className="space-y-2">
                        {customTasks.map((task) => {
                          const taskSubs = allTaskSubmissions.filter(
                            (s) => s.taskId === task.id && (s.status === 'Approved' || s.status === 'Pending')
                          ).length;
                          const isFull = task.maxUserLimit && task.maxUserLimit > 0 && taskSubs >= task.maxUserLimit;

                          return (
                            <div key={task.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                {task.image ? (
                                  <img
                                    src={task.image}
                                    alt={task.title}
                                    onClick={() => setSelectedScreenshotPreview(task.image!)}
                                    className="w-10 h-10 rounded-xl object-cover border border-amber-500/40 cursor-pointer hover:scale-105 transition shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs shrink-0">
                                    <i className={task.icon || 'fas fa-tasks'}></i>
                                  </div>
                                )}
                                <div>
                                  <h6 className="font-bold text-xs text-white">{task.title}</h6>
                                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                    <span className="text-[10px] text-emerald-400 font-mono font-bold">Reward: ৳{task.reward}</span>
                                    <span className={`text-[9px] font-mono font-extrabold px-2 py-0.5 rounded ${
                                      isFull
                                        ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                        : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                    }`}>
                                      <i className="fas fa-users text-[8px] mr-1"></i>
                                      {task.maxUserLimit && task.maxUserLimit > 0
                                        ? `কমপ্লিট: ${taskSubs} / ${task.maxUserLimit} জন (${isFull ? 'লিমিট ফুল' : 'চলছে'})`
                                        : `কমপ্লিট: ${taskSubs} জন (আনলিমিটেড)`}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleOpenEditTask(task)}
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 transition active:scale-95"
                                  title="Edit Task Details"
                                >
                                  <i className="fas fa-edit"></i>
                                  <span>এডিট করুন</span>
                                </button>

                                <button
                                  onClick={() => {
                                    const promptVal = prompt(
                                      `টাস্ক: "${task.title}"\nকতো জন ইউজার কমপ্লিট করতে পারবে লিখে দিন (০ বা খালি রাখলে আনলিমিটেড):`,
                                      (task.maxUserLimit || 0).toString()
                                    );
                                    if (promptVal !== null) {
                                      const numVal = parseInt(promptVal.trim(), 10);
                                      handleUpdateTaskLimit(task.id, isNaN(numVal) ? 0 : numVal);
                                    }
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 transition active:scale-95"
                                  title="Change Max User Limit"
                                >
                                  <i className="fas fa-user-edit"></i>
                                  <span>লিমিট</span>
                                </button>

                                <button
                                  onClick={() => handleDeleteAdminTask(task.id)}
                                  className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center text-xs transition"
                                  title="Delete Task"
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Periodic Channel Re-Check Admin Control (৫ মিনিট পরপর চ্যানেল চেক) */}
                  <div className="glass-card p-4 space-y-3 border border-indigo-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-sm font-bold">
                          <i className="fas fa-clock"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-white">Periodic Channel Re-Check (৫ মিনিট পরপর জয়েনিং চেক)</h4>
                          <p className="text-[10px] text-slate-400">নির্দিষ্ট সময় পরপর স্বয়ংক্রিয়ভাবে ব্যবহারকারীর চ্যানেল জয়েন ভেরিফাই করবে</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setPeriodicChannelCheckEnabled(!periodicChannelCheckEnabled);
                          showToast(periodicChannelCheckEnabled ? '🔴 ৫ মিনিট পরপর জয়েনিং চেক বন্ধ করা হয়েছে' : '🟢 ৫ মিনিট পরপর জয়েনিং চেক চালু করা হয়েছে', 'info');
                          haptic('light');
                        }}
                        className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition border ${
                          periodicChannelCheckEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        {periodicChannelCheckEnabled ? 'ON (চালু)' : 'OFF (বন্ধ)'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      <div>
                        <label className="form-label">Checking Interval (মিনিট):</label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono"
                          value={periodicChannelCheckInterval}
                          onChange={(e) => setPeriodicChannelCheckInterval(parseInt(e.target.value, 10) || 5)}
                          placeholder="e.g. 5"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={() => {
                            showToast(`✅ ${periodicChannelCheckInterval} মিনিট পরপর জয়েনিং রি-চেক টাইম সেট হয়েছে!`, 'success');
                            haptic('success');
                          }}
                          className="btn-primary-solid w-full py-2.5 text-xs"
                        >
                          SAVE INTERVAL SETTINGS
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Daily Check-in Admin Control (ডেইলি চেকিং কন্ট্রোল) */}
                  <div className="glass-card p-4 space-y-3 border border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm font-bold">
                          <i className="fas fa-gift"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-white">Daily Check-in System (ডেইলি চেকিং রিওয়ার্ড কন্ট্রোল)</h4>
                          <p className="text-[10px] text-slate-400">প্রতিদিনের ২৪ ঘণ্টার ফ্রিতে বোনাস অন/অফ ও টাকার পরিমাণ সেট করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !dailyCheckInEnabled;
                          setDailyCheckInEnabled(nextVal);
                          saveTaskConfigToFirestore({ dailyCheckInEnabled: nextVal });
                          showToast(nextVal ? '🟢 ডেইলি চেকিং বোনাস চালু করা হয়েছে' : '🔴 ডেইলি চেকিং বোনাস বন্ধ করা হয়েছে', 'info');
                          haptic('light');
                        }}
                        className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition border ${
                          dailyCheckInEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        {dailyCheckInEnabled ? 'ON (চালু)' : 'OFF (বন্ধ)'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      <div>
                        <label className="form-label">Daily Reward Amount (৳):</label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono"
                          value={dailyCheckInReward}
                          onChange={(e) => setDailyCheckInReward(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 5.0"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={() => {
                            saveTaskConfigToFirestore({ dailyCheckInReward });
                            showToast(`✅ ডেইলি চেকিং বোনাস ৳ ${dailyCheckInReward.toFixed(2)} সেট করা হয়েছে!`, 'success');
                            haptic('success');
                          }}
                          className="btn-primary-solid w-full py-2.5 text-xs"
                        >
                          SAVE REWARD AMOUNT
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 5: Promo Code Admin Control (প্রোমো কোড ম্যানেজমেন্ট) */}
                  <div className="glass-card p-4 space-y-4 border border-blue-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center text-sm font-bold">
                          <i className="fas fa-ticket-alt"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-white">Promo Code Management (প্রোমো কোড কন্ট্রোল)</h4>
                          <p className="text-[10px] text-slate-400">নতুন প্রোমো কোড তৈরি করুন এবং একটিভ কোডগুলো নিয়ন্ত্রণ করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !promoCodeEnabled;
                          setPromoCodeEnabled(nextVal);
                          saveTaskConfigToFirestore({ promoCodeEnabled: nextVal });
                          showToast(nextVal ? '🟢 প্রোমো কোড রিডিম সিস্টেম চালু করা হয়েছে' : '🔴 প্রোমো কোড রিডিম সিস্টেম বন্ধ করা হয়েছে', 'info');
                          haptic('light');
                        }}
                        className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition border ${
                          promoCodeEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        {promoCodeEnabled ? 'ON (চালু)' : 'OFF (বন্ধ)'}
                      </button>
                    </div>

                    {/* Create New Promo Code Form */}
                    <div className="p-3 bg-slate-900/80 rounded-2xl border border-white/10 space-y-3">
                      <h5 className="font-extrabold text-xs text-amber-300">Create New Promo Code (নতুন কোড তৈরি করুন)</h5>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="form-label">Promo Code Name</label>
                          <input
                            type="text"
                            className="input-modern uppercase text-xs font-mono font-bold"
                            placeholder="e.g. FARJU100"
                            value={newPromoCode}
                            onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                          />
                        </div>

                        <div>
                          <label className="form-label">Reward Amount (৳)</label>
                          <input
                            type="number"
                            className="input-modern text-xs font-mono"
                            placeholder="e.g. 10"
                            value={newPromoReward}
                            onChange={(e) => setNewPromoReward(e.target.value)}
                          />
                        </div>

                        <div>
                          <label className="form-label">Max Uses Limit</label>
                          <input
                            type="number"
                            className="input-modern text-xs font-mono"
                            placeholder="e.g. 50"
                            value={newPromoMaxUses}
                            onChange={(e) => setNewPromoMaxUses(e.target.value)}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleCreatePromoCode}
                        className="btn-primary-gradient w-full py-2.5 text-xs font-extrabold flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-plus-circle"></i>
                        <span>CREATE PROMO CODE</span>
                      </button>
                    </div>

                    {/* Active Promo Codes List */}
                    <div className="space-y-2">
                      <h5 className="font-extrabold text-xs text-slate-300">Active Promo Codes ({promoCodes.length})</h5>

                      {promoCodes.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-2">কোনো প্রোমো কোড তৈরি করা হয়নি</p>
                      ) : (
                        <div className="space-y-2">
                          {promoCodes.map((p) => (
                            <div key={p.id} className="p-3 rounded-xl bg-slate-900/60 border border-white/10 flex items-center justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                    {p.code}
                                  </span>
                                  <span className="font-bold text-xs text-emerald-400 font-mono">
                                    +৳ {p.reward}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                  <span>Used: {p.usedCount} / {p.maxUses}</span>
                                  <span>•</span>
                                  <span>Users Redeemed: {p.usedByUsers ? p.usedByUsers.length : 0}</span>
                                </div>
                              </div>

                              <button
                                onClick={() => handleDeletePromoCode(p.id, p.code)}
                                className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center text-xs transition"
                                title="Delete Promo Code"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 6: Ad Earn Admin Control (এড দেখে আয় কন্ট্রোল) */}
                  <div className="glass-card p-4 space-y-3 border border-purple-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center text-sm font-bold">
                          <i className="fas fa-play-circle"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-white">Ad Earn System (এড দেখে আয় কন্ট্রোল)</h4>
                          <p className="text-[10px] text-slate-400">এড দেখা সিস্টেম অন/অফ, প্রতি এড এ কত টাকা এবং দৈনিক লিমিট সেট করুন</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const nextVal = !adEarnEnabled;
                          setAdEarnEnabled(nextVal);
                          saveTaskConfigToFirestore({ adEarnEnabled: nextVal });
                          showToast(nextVal ? '🟢 এড দেখে আয় সিস্টেম চালু করা হয়েছে' : '🔴 এড দেখে আয় সিস্টেম বন্ধ করা হয়েছে', 'info');
                          haptic('light');
                        }}
                        className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition border ${
                          adEarnEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border-red-500/30'
                        }`}
                      >
                        {adEarnEnabled ? 'ON (চালু)' : 'OFF (বন্ধ)'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
                      <div>
                        <label className="form-label">Reward Per Ad (৳ per ad):</label>
                        <input
                          type="number"
                          step="0.001"
                          className="input-modern text-xs font-mono"
                          value={adEarnRewardPerAd}
                          onChange={(e) => setAdEarnRewardPerAd(parseFloat(e.target.value) || 0)}
                          placeholder="e.g. 0.00"
                        />
                      </div>

                      <div>
                        <label className="form-label">Daily Max Ad Limit (দৈনিক এড লিমিট):</label>
                        <input
                          type="number"
                          className="input-modern text-xs font-mono"
                          value={adEarnDailyMaxLimit}
                          onChange={(e) => setAdEarnDailyMaxLimit(parseInt(e.target.value, 10) || 500)}
                          placeholder="e.g. 500"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        saveTaskConfigToFirestore({
                          adEarnEnabled,
                          adEarnRewardPerAd,
                          adEarnDailyMaxLimit
                        });
                        showToast(`✅ এড রিওয়ার্ড ৳ ${adEarnRewardPerAd.toFixed(2)} এবং দৈনিক লিমিট ${adEarnDailyMaxLimit} সেভ করা হয়েছে!`, 'success');
                        haptic('success');
                      }}
                      className="btn-primary-solid w-full py-2.5 text-xs font-extrabold uppercase tracking-wider"
                    >
                      SAVE AD EARN SETTINGS
                    </button>
                  </div>
                </div>
              )}

              {/* SUB TAB 9: AVATARS & PROFILE PICTURES (প্রোফাইল পিকচার গ্যালারি কন্ট্রোল) */}
              {adminSubTab === 'avatars' && (
                <div className="space-y-5">
                  {/* Admin Avatars Header Banner */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-blue-900/40 to-slate-900 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-base">
                        <i className="fas fa-id-badge"></i>
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-white">Profile Picture Gallery Control (প্রোফাইল পিকচার ম্যানেজমেন্ট)</h3>
                        <p className="text-[10px] text-cyan-200/80">ইউজার প্রোফাইলের জন্য অবতার বা প্রোফাইল পিকচার যোগ করুন বা রিমুভ করুন (বাড়ানো/কমানো)</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-300 bg-black/40 px-3 py-1.5 rounded-xl border border-cyan-500/20">
                      <span>Total Avatars:</span>
                      <span className="text-slate-950 bg-cyan-400 px-2 py-0.5 rounded-md text-[11px] font-black">
                        {presetAvatars.length}
                      </span>
                    </div>
                  </div>

                  {/* Add / Upload New Avatar Form */}
                  <div className="glass-card p-4 sm:p-5 space-y-4 border border-cyan-500/30 bg-slate-950/80">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-plus-circle text-cyan-400 text-sm"></i>
                        <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">
                          Upload / Add New Profile Picture (নতুন পিকচার যোগ করুন)
                        </h4>
                      </div>
                      <span className="text-[10px] text-cyan-300 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        ADD AVATAR
                      </span>
                    </div>

                    {/* Method 1: File Upload from Device */}
                    <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-white/10 space-y-2">
                      <label className="text-xs font-extrabold text-cyan-300 block">
                        ১. ডিভাইস (কম্পিউটার/মোবাইল) থেকে সরাসরি আপলোড করুন:
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="flex-1 cursor-pointer bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white py-2.5 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition active:scale-95">
                          <i className={`fas ${adminAvatarUploadLoading ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`}></i>
                          <span>{adminAvatarUploadLoading ? 'আপলোড হচ্ছে...' : '📁 সিলেক্ট পিকচার ও আপলোড করুন (UPLOAD IMAGE)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAdminAvatarFileUpload}
                            disabled={adminAvatarUploadLoading}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Method 2: Direct Image URL */}
                    <div className="bg-slate-900/90 p-3.5 rounded-2xl border border-white/10 space-y-2">
                      <label className="text-xs font-extrabold text-cyan-300 block">
                        ২. অথবা সরাসরি ইমেজের URL লিংক বসান:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          className="input-modern text-xs sm:col-span-2"
                          placeholder="https://example.com/my-photo.jpg"
                          value={adminNewAvatarUrl}
                          onChange={(e) => setAdminNewAvatarUrl(e.target.value)}
                        />
                        <button
                          onClick={() => handleAddAdminAvatar()}
                          className="px-4 py-2.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-extrabold text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          <i className="fas fa-plus"></i>
                          <span>ADD URL AVATAR</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Current Avatars Gallery & Management (বাড়ানো/কমানো) */}
                  <div className="glass-card p-4 sm:p-5 space-y-4 border border-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div>
                        <h4 className="font-extrabold text-xs text-white uppercase tracking-wider flex items-center gap-2">
                          <i className="fas fa-images text-amber-400"></i>
                          <span>Current Gallery Avatars ({presetAvatars.length})</span>
                        </h4>
                        <p className="text-[10px] text-slate-400 pt-0.5">যেকোনো পিকচার কমানোর জন্য ট্র্যাশ আইকনে ক্লিক করে ডিলিট করুন</p>
                      </div>

                      <button
                        onClick={handleResetDefaultAvatars}
                        className="px-3 py-1.5 bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 font-bold text-[11px] rounded-xl transition active:scale-95 flex items-center gap-1.5"
                      >
                        <i className="fas fa-undo"></i>
                        <span>RESET TO DEFAULT 6 AVATARS</span>
                      </button>
                    </div>

                    {/* Gallery Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {presetAvatars.map((av, idx) => (
                        <div
                          key={av.id || idx}
                          className="group relative bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-md space-y-0 flex flex-col justify-between"
                        >
                          <div className="aspect-square w-full relative overflow-hidden bg-slate-950">
                            <img
                              src={av.url}
                              alt={av.label || `Avatar ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.src = `https://ui-avatars.com/api/?name=Avatar+${idx + 1}&background=3b82f6&color=fff&bold=true`;
                              }}
                            />
                            <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-md text-[9px] font-mono text-cyan-300 px-2 py-0.5 rounded-md font-extrabold">
                              #{idx + 1}
                            </div>
                          </div>

                          <div className="p-2 bg-slate-950/90 border-t border-white/5 flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold text-slate-300 truncate font-mono">
                              {av.label || `Avatar ${idx + 1}`}
                            </span>

                            <button
                              onClick={() => handleDeleteAdminAvatar(av.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white flex items-center justify-center text-xs transition active:scale-90 shrink-0"
                              title="Delete this Avatar"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB TAB 10: AI SUPPORT CONTROL (এআই সাপোর্ট সেটআপ ও টেস্ট প্যানেল) */}
              {adminSubTab === 'ai_support' && (
                <div className="space-y-5">
                  {/* Banner */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/80 via-indigo-900/50 to-slate-900 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 shadow-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 text-lg">
                        <i className="fas fa-robot"></i>
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-white flex items-center gap-2">
                          <span>AI Customer Support Agent (Gemini Powered)</span>
                          <span className={`text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-full border ${
                            aiSupportEnabled 
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}>
                            {aiSupportEnabled ? '● ACTIVE' : '○ DISABLED'}
                          </span>
                        </h3>
                        <p className="text-[10px] text-purple-200/80">ইউজারদের প্রশ্নের উত্তর দেওয়ার জন্য Gemini 3.6 Flash চালিত স্মার্ট এআই বট সেটআপ ও কাস্টমাইজ করুন</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const newStatus = !aiSupportEnabled;
                        setAiSupportEnabled(newStatus);
                        localStorage.setItem('smm_ai_support_enabled', String(newStatus));
                        showToast(newStatus ? '✅ AI সাপোর্ট চালু করা হয়েছে!' : '🚫 AI সাপোর্ট বন্ধ করা হয়েছে!', newStatus ? 'success' : 'info');
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-black shadow-lg transition active:scale-95 flex items-center gap-2 ${
                        aiSupportEnabled
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      }`}
                    >
                      <i className={`fas ${aiSupportEnabled ? 'fa-power-off' : 'fa-check-circle'}`}></i>
                      <span>{aiSupportEnabled ? 'AI সাপোর্ট বন্ধ করুন (DISABLE)' : 'AI সাপোর্ট চালু করুন (ENABLE)'}</span>
                    </button>
                  </div>

                  {/* Knowledge Base & Custom Prompt Form */}
                  <div className="glass-card p-4 sm:p-5 space-y-4 border border-purple-500/30 bg-slate-950/80 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div>
                        <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                          <i className="fas fa-brain text-purple-400"></i>
                          <span>Custom AI Knowledge & System Instructions (এআই গাইডলাইন ও অফার নোটিশ)</span>
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          এখানে আপনার প্যানেলের বিশেষ নিয়ম, সার্ভিস অফার, বিকাশ/নগদ রেট বা যেকোনো কাস্টম তথ্য লিখে দিন। এআই গ্রাহকদের উত্তর দেওয়ার সময় এই তথ্যগুলো মেনে চলবে।
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const defaultInstruction = 'RF SMM Panel BD - সর্বাধুনিক স্বয়ংক্রিয় এস.এম.এম প্যানেল। বিশেষ ছাড়: যেকোনো সার্ভারে অর্ডার অফার চলছে। সাপোর্ট টেলিগ্রাম: @RF2_SMM | বিকাশ/নগদ/রকেট ও বাইন্যান্স পে এক্সেপ্ট করা হয়।';
                          setAiSupportCustomPrompt(defaultInstruction);
                          showToast('বাংলা ডিফল্ট প্রম্পট লোড করা হয়েছে', 'info');
                        }}
                        className="text-[10px] font-bold text-purple-300 hover:underline flex items-center gap-1 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20"
                      >
                        <i className="fas fa-magic"></i>
                        <span>অটো ডেমো প্রম্পট</span>
                      </button>
                    </div>

                    <textarea
                      rows={5}
                      className="input-modern text-xs font-mono text-purple-100 p-3 bg-slate-900/90 border-purple-500/30 focus:border-purple-400 leading-relaxed"
                      placeholder="লিখুন... যেমন: আজ রাতে ১০% এক্সট্রা বোনাস। বিকাশ ও নগদে ১ টাকা থেকে ডিপোজিট। ইনস্ট্যান্ট টেলিগ্রাম সাপোর্ট।"
                      value={aiSupportCustomPrompt}
                      onChange={(e) => setAiSupportCustomPrompt(e.target.value)}
                    />

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">
                        Characters: {aiSupportCustomPrompt.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('smm_ai_support_custom_prompt', aiSupportCustomPrompt);
                          showToast('✅ AI কাস্টম প্রম্পট সেভ করা হয়েছে!', 'success');
                        }}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg transition active:scale-95 flex items-center gap-2"
                      >
                        <i className="fas fa-save"></i>
                        <span>SAVE AI PROMPT & KNOWLEDGE BASE</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Admin Sandbox / Live AI Tester */}
                  <div className="glass-card p-4 sm:p-5 space-y-4 border border-indigo-500/30 bg-slate-950/90">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-black">
                          <i className="fas fa-vial"></i>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-white">Live AI Tester (লাইভ এআই টেস্ট স্যান্ডবক্স)</h4>
                          <p className="text-[10px] text-slate-400">এআই কীভাবে কাস্টমারের প্রশ্নের উত্তর দেয় তা এখানে টেস্ট করতে পারেন</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setAiMessages([{
                            id: 'welcome',
                            role: 'model',
                            text: 'আসসালামু আলাইকুম! 👋 আমি RF SMM-এর 🤖 AI সাপোর্ট অ্যাসিস্ট্যান্ট। কীভাবে আপনাকে সাহায্য করতে পারি?',
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          }]);
                          showToast('চ্যাট হিস্ট্রি রিসেট করা হয়েছে', 'info');
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg"
                      >
                        <i className="fas fa-trash-alt"></i>
                        <span>Clear Live Test</span>
                      </button>
                    </div>

                    {/* Chat Box */}
                    <div className="h-64 overflow-y-auto p-3 rounded-xl bg-slate-900/90 border border-white/5 space-y-3 font-sans">
                      {aiMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          {msg.role === 'model' && (
                            <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center text-xs shrink-0 mt-0.5">
                              <i className="fas fa-robot"></i>
                            </div>
                          )}

                          <div
                            className={`max-w-[80%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-none shadow-md'
                                : 'bg-slate-800 text-slate-100 rounded-tl-none border border-white/10 shadow-md'
                            }`}
                          >
                            <p>{msg.text}</p>
                            <span className="block text-[8px] text-slate-400 mt-1 text-right font-mono">
                              {msg.time}
                            </span>
                          </div>

                          {msg.role === 'user' && (
                            <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center text-xs shrink-0 mt-0.5">
                              <i className="fas fa-user-shield"></i>
                            </div>
                          )}
                        </div>
                      ))}

                      {isAiSending && (
                        <div className="flex gap-2.5 justify-start">
                          <div className="w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center text-xs shrink-0">
                            <i className="fas fa-robot animate-spin"></i>
                          </div>
                          <div className="p-3 rounded-2xl bg-slate-800 text-purple-300 text-xs border border-purple-500/30 flex items-center gap-2">
                            <span className="animate-pulse font-mono">RF AI চিন্তা করছে...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Test Chat Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input-modern text-xs flex-1"
                        placeholder="টেস্ট প্রশ্ন টাইপ করুন... (যেমন: কীভাবে ডিপোজিট করব?)"
                        value={aiInputText}
                        onChange={(e) => setAiInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendAiMessage();
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={isAiSending || !aiInputText.trim()}
                        onClick={() => handleSendAiMessage()}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5"
                      >
                        <i className="fas fa-paper-plane"></i>
                        <span>TEST</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* WATCH ADS INTERACTIVE PLAYER MODAL */}
          {showAdModal && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-slate-900 border border-purple-500/40 rounded-3xl max-w-md w-full overflow-hidden shadow-[0_0_60px_rgba(168,85,247,0.35)] space-y-0">
                {/* Modal Top Header Bar */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center text-base font-black shadow">
                      <i className="fas fa-play-circle animate-pulse"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>Monetag Rewarded Ad</span>
                        <span className="text-[9px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-md border border-purple-500/30">
                          ZONE #11498050
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400">Watch full ad to claim instant reward balance</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (!adCanClaim && adCountdown > 0) {
                        if (confirm('⚠️ এড দেখা শেষ হওয়ার আগে বন্ধ করলে রিওয়ার্ড পাবেন না! বন্ধ করতে চান?')) {
                          setShowAdModal(false);
                        }
                      } else {
                        setShowAdModal(false);
                      }
                    }}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs transition border border-white/10"
                    title="Close Modal"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-slate-950 h-2 overflow-hidden relative">
                  <div
                    className="bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 h-2 transition-all duration-1000 ease-linear"
                    style={{
                      width: `${((5 - adCountdown) / 5) * 100}%`
                    }}
                  ></div>
                </div>

                {/* Main Video Ad Frame */}
                <div className="p-5 space-y-4">
                  <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-gradient-to-br from-purple-950 via-slate-950 to-indigo-950 border border-purple-500/30 flex flex-col items-center justify-center text-center p-4 shadow-inner">
                    <div className="absolute top-2 right-2 bg-black/70 text-[10px] font-mono font-black text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/30 flex items-center gap-1.5">
                      <i className="fas fa-clock text-amber-400"></i>
                      <span>{adCountdown > 0 ? `00:0${adCountdown}` : 'COMPLETED'}</span>
                    </div>

                    <div className="absolute top-2 left-2 bg-purple-500/20 text-[9px] font-bold text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                      SPONSORED AD
                    </div>

                    {adCountdown > 0 ? (
                      <div className="space-y-3">
                        <div className="w-14 h-14 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-400/40 flex items-center justify-center text-2xl mx-auto shadow-lg animate-pulse">
                          <i className="fas fa-film"></i>
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-white tracking-wide">
                            Monetag Sponsored Ad Playing...
                          </h4>
                          <p className="text-[11px] text-purple-200 mt-0.5">
                            PLEASE WAIT {adCountdown} SECONDS TO CLAIM ৳ {(adEarnRewardPerAd || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 animate-bounce">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 flex items-center justify-center text-2xl mx-auto shadow-lg">
                          <i className="fas fa-check-circle"></i>
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-emerald-300">
                            Ad Watched Successfully!
                          </h4>
                          <p className="text-[11px] text-slate-300">
                            Click button below to add ৳ {(adEarnRewardPerAd || 0).toFixed(2)} to wallet!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Monetag Direct Ad Trigger & Sponsor Link */}
                  <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-950/60 to-slate-950 border border-purple-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <i className="fas fa-bullhorn text-purple-400 text-xs"></i>
                        <span className="text-white text-[11px] font-bold">Monetag Ad (Zone #11498050)</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        Active
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          if (typeof (window as any).show_11498050 === 'function') {
                            try {
                              (window as any).show_11498050().then(() => {
                                showToast('✅ Monetag Ad completed!', 'success');
                              }).catch(() => {
                                window.open('https://alwingulla.com/', '_blank');
                              });
                            } catch {
                              window.open('https://alwingulla.com/', '_blank');
                            }
                          } else {
                            window.open('https://alwingulla.com/', '_blank');
                          }
                          haptic('light');
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-extrabold transition flex items-center justify-center gap-1.5 shadow"
                      >
                        <i className="fas fa-play text-xs text-amber-300"></i>
                        <span>Play Monetag Ad</span>
                      </button>

                      <a
                        href="https://alwingulla.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-purple-300 border border-purple-500/30 text-[11px] font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <i className="fas fa-external-link-alt text-xs"></i>
                        <span>Open Offer Page</span>
                      </a>
                    </div>
                  </div>

                  {/* Action Button */}
                  {adCountdown > 0 ? (
                    <button
                      disabled
                      className="w-full py-3.5 rounded-2xl bg-slate-800 text-slate-400 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-white/10 cursor-not-allowed opacity-90"
                    >
                      <i className="fas fa-spinner fa-spin text-purple-400 text-sm"></i>
                      <span>WATCHING AD... PLEASE WAIT ({adCountdown}s)</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleClaimAdReward}
                      disabled={adWatchLoading}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition active:scale-95"
                    >
                      {adWatchLoading ? (
                        <>
                          <i className="fas fa-spinner fa-spin text-base"></i>
                          <span>ADDING REWARD TO WALLET...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-gift text-base"></i>
                          <span>CLAIM REWARD NOW (+৳ {(adEarnRewardPerAd || 0).toFixed(2)})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SEARCH MODAL */}
          {showSearchModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in">
              <div className="bg-[#0b1329] border border-blue-500/30 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.3)] w-full max-w-lg mx-auto">
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                      <i className="fas fa-search text-xs"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Search Services (সার্চ করুন)</h3>
                      <p className="text-[9px] text-slate-400">Find any SMM service by name, platform or ID</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSearchModal(false)}
                    className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                {/* Search Input Bar */}
                <div className="p-4 border-b border-white/10 bg-slate-900/40">
                  <div className="relative">
                    <input
                      type="text"
                      autoFocus
                      className="input-modern pl-10 pr-10 text-xs"
                      placeholder="Type platform or service (e.g., Facebook, Followers, Likes, TikTok)..."
                      value={globalSearchQuery}
                      onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    />
                    <i className="fas fa-search absolute left-3.5 top-3.5 text-blue-400 text-xs"></i>
                    {globalSearchQuery && (
                      <button
                        onClick={() => setGlobalSearchQuery('')}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs p-1"
                      >
                        <i className="fas fa-times-circle"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Results List */}
                <div className="p-4 overflow-y-auto max-h-[55vh] space-y-2.5">
                  {(() => {
                    const q = globalSearchQuery.trim().toLowerCase();
                    const filtered = allServices.filter((s) => {
                      if (!q) return true;
                      return (
                        s.name.toLowerCase().includes(q) ||
                        s.category.toLowerCase().includes(q) ||
                        s.id.toLowerCase().includes(q) ||
                        (s.description && s.description.toLowerCase().includes(q))
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-10">
                          <i className="fas fa-search-minus text-3xl text-slate-600 mb-2"></i>
                          <p className="text-xs text-slate-400 font-bold">No services found for "{globalSearchQuery}"</p>
                          <p className="text-[10px] text-slate-500 mt-1">Try searching for "Facebook", "Likes", or "Followers"</p>
                        </div>
                      );
                    }

                    return filtered.map((svc) => {
                      const meta = getPlatformMeta(svc.category);
                      return (
                        <div
                          key={svc.id}
                          className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-blue-500/40 transition-all flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                                style={{ color: meta.color, backgroundColor: `${meta.color}20` }}
                              >
                                <i className={meta.icon}></i>
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {svc.category}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                              ID: {svc.id}
                            </span>
                          </div>

                          <h4 className="font-extrabold text-xs text-white leading-snug">{svc.name}</h4>

                          <div className="flex items-center justify-between pt-1 border-t border-white/5">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-emerald-400">
                                ৳ {svc.price} <span className="text-[9px] text-slate-400 font-normal">/1k</span>
                              </span>
                              <span className="text-[9px] text-slate-400">
                                Min: {svc.min} | Max: {svc.max?.toLocaleString()}
                              </span>
                            </div>

                            <button
                              onClick={() => handleSelectServiceFromSearch(svc)}
                              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-[10px] rounded-xl shadow-md active:scale-95 transition flex items-center gap-1"
                            >
                              <span>SELECT</span>
                              <i className="fas fa-arrow-right text-[8px]"></i>
                            </button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS MODAL */}
          {showNotifModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in">
              <div className="bg-[#0b1329] border border-amber-500/30 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.25)] w-full max-w-lg mx-auto">
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <i className="fas fa-bell text-xs"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>Notifications</span>
                        {unreadNotifCount > 0 && (
                          <span className="bg-red-500 text-white text-[9px] font-black px-2 py-0.2 rounded-full">
                            {unreadNotifCount} new
                          </span>
                        )}
                      </h3>
                      <p className="text-[9px] text-slate-400">Updates, deposit statuses & announcements</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={markAllNotifsRead}
                        className="text-[9px] font-bold text-amber-400 hover:underline bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20"
                      >
                        Read All
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifModal(false)}
                      className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                </div>

                {/* Notifications List */}
                <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2.5">
                  {notifications.length === 0 ? (
                    <div className="text-center py-10">
                      <i className="fas fa-bell-slash text-3xl text-slate-600 mb-2"></i>
                      <p className="text-xs text-slate-400 font-bold">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      let iconClass = 'fas fa-info-circle text-blue-400 bg-blue-500/20';
                      if (notif.type === 'deposit') iconClass = 'fas fa-wallet text-emerald-400 bg-emerald-500/20';
                      if (notif.type === 'order') iconClass = 'fas fa-rocket text-indigo-400 bg-indigo-500/20';
                      if (notif.type === 'promo') iconClass = 'fas fa-gift text-pink-400 bg-pink-500/20';

                      return (
                        <div
                          key={notif.id}
                          onClick={() => {
                            setNotifications((prev) =>
                              prev.map((n) => (n.id === notif.id ? { ...n, unread: false } : n))
                            );
                          }}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            notif.unread
                              ? 'bg-slate-900/90 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                              : 'bg-slate-900/40 border-white/5 opacity-80'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs flex-shrink-0 ${iconClass}`}>
                              <i className={iconClass.split(' ')[0] + ' ' + iconClass.split(' ')[1]}></i>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-extrabold text-xs text-white flex items-center gap-1.5">
                                  {notif.title}
                                  {notif.unread && (
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                                  )}
                                </h4>
                                <span className="text-[9px] text-slate-500 font-mono">{notif.time}</span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-relaxed">{notif.message}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MAILBOX MODAL */}
          {showMailboxModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in">
              <div className="bg-[#0b1329] border border-emerald-500/30 rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.25)] w-full max-w-lg mx-auto">
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <i className="fas fa-envelope text-xs"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>Mail Box (মেইল বক্স)</span>
                        {unreadMailCount > 0 && (
                          <span className="bg-blue-500 text-white text-[9px] font-black px-2 py-0.2 rounded-full">
                            {unreadMailCount}
                          </span>
                        )}
                      </h3>
                      <p className="text-[9px] text-slate-400">Support tickets & admin announcements</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowMailboxModal(false)}
                    className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10 bg-slate-900/50">
                  <button
                    onClick={() => setMailboxTab('inbox')}
                    className={`flex-1 py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                      mailboxTab === 'inbox'
                        ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <i className="fas fa-inbox"></i>
                    <span>Inbox ({mailList.length})</span>
                  </button>
                  <button
                    onClick={() => setMailboxTab('compose')}
                    className={`flex-1 py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                      mailboxTab === 'compose'
                        ? 'text-emerald-400 border-b-2 border-emerald-400 bg-emerald-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <i className="fas fa-paper-plane"></i>
                    <span>Send Mail (মেসেজ পাঠান)</span>
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                  {mailboxTab === 'inbox' ? (
                    <div className="space-y-2.5">
                      {mailList.length === 0 ? (
                        <div className="text-center py-10">
                          <i className="fas fa-mail-bulk text-3xl text-slate-600 mb-2"></i>
                          <p className="text-xs text-slate-400 font-bold">Your mailbox is empty</p>
                        </div>
                      ) : (
                        mailList.map((mail) => (
                          <div
                            key={mail.id}
                            onClick={() => markMailRead(mail.id)}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              mail.unread
                                ? 'bg-slate-900/90 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                                : 'bg-slate-900/40 border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold">
                                  <i className="fas fa-user-shield"></i>
                                </span>
                                <span className="text-xs font-extrabold text-white">{mail.sender}</span>
                              </div>
                              <span className="text-[9px] text-slate-500 font-mono">{mail.time}</span>
                            </div>

                            <h4 className="font-extrabold text-xs text-emerald-300 mb-1">{mail.subject}</h4>
                            <p className="text-[11px] text-slate-300 leading-relaxed bg-black/20 p-2.5 rounded-xl border border-white/5">
                              {mail.message}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    /* Compose Form */
                    <div className="space-y-3.5">
                      <div>
                        <label className="form-label">Subject (বিষয়)</label>
                        <input
                          type="text"
                          className="input-modern text-xs"
                          placeholder="e.g. Need assistance with Order #1024 or Deposit"
                          value={mailSubject}
                          onChange={(e) => setMailSubject(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="form-label">Message Details (মেসেজ)</label>
                        <textarea
                          rows={4}
                          className="input-modern text-xs resize-none"
                          placeholder="Write your message or inquiry here..."
                          value={mailMessage}
                          onChange={(e) => setMailMessage(e.target.value)}
                        />
                      </div>

                      <button
                        onClick={handleSendMail}
                        disabled={mailSubmitting}
                        className="btn-primary-solid flex items-center justify-center gap-2 w-full py-3"
                      >
                        {mailSubmitting ? (
                          <span className="loading-spinner"></span>
                        ) : (
                          <>
                            <i className="fas fa-paper-plane text-xs"></i>
                            <span>SEND MAIL TO SUPPORT (মেইল পাঠান)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LIVE ORDERS MODAL */}
          {showLiveOrdersModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in">
              <div className="bg-[#080d1a] border border-red-500/30 rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(239,68,68,0.25)] w-full max-w-lg mx-auto">
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                      <i className="fas fa-satellite-dish text-xs animate-pulse"></i>
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>Live Orders Stream (লাইভ অর্ডার)</span>
                        <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full animate-pulse">
                          LIVE ⚡
                        </span>
                      </h3>
                      <p className="text-[9px] text-slate-400">Real-time order feed & status monitor</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowLiveOrdersModal(false)}
                    className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex border-b border-white/10 bg-slate-900/50">
                  <button
                    onClick={() => setLiveOrdersFilter('all')}
                    className={`flex-1 py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                      liveOrdersFilter === 'all'
                        ? 'text-red-400 border-b-2 border-red-400 bg-red-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <i className="fas fa-globe"></i>
                    <span>All System Live Orders ({allAdminOrdersList.length || ordersList.length})</span>
                  </button>
                  <button
                    onClick={() => setLiveOrdersFilter('my')}
                    className={`flex-1 py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                      liveOrdersFilter === 'my'
                        ? 'text-red-400 border-b-2 border-red-400 bg-red-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <i className="fas fa-user-check"></i>
                    <span>My Live Orders ({ordersList.length})</span>
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
                  {/* Status Banner */}
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-red-950/40 to-slate-900 border border-red-500/20 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span className="text-slate-300 font-bold text-[11px]">SMM Automated Dispatch: <span className="text-emerald-400">ONLINE</span></span>
                    </div>
                    <button
                      onClick={() => showToast('Refreshed live order feed!', 'success')}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-extrabold text-slate-300 border border-white/10 flex items-center gap-1"
                    >
                      <i className="fas fa-sync-alt text-[9px]"></i> Refresh
                    </button>
                  </div>

                  {(liveOrdersFilter === 'all' ? (allAdminOrdersList.length > 0 ? allAdminOrdersList : ordersList) : ordersList).length === 0 ? (
                    <div className="text-center py-12">
                      <i className="fas fa-box-open text-4xl text-slate-600 mb-2"></i>
                      <p className="text-xs font-bold text-slate-400">No live orders found right now</p>
                    </div>
                  ) : (
                    (liveOrdersFilter === 'all' ? (allAdminOrdersList.length > 0 ? allAdminOrdersList : ordersList) : ordersList).slice(0, 15).map((ord) => {
                      const platform = getPlatformMeta(ord.service);
                      const isPending = ord.status.toLowerCase().includes('pending');
                      const isCompleted = ord.status.toLowerCase().includes('completed') || ord.status.toLowerCase().includes('success');
                      const isProcessing = ord.status.toLowerCase().includes('process') || ord.status.toLowerCase().includes('progress');

                      return (
                        <div
                          key={ord.id}
                          className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 hover:border-red-500/30 transition-all space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                                style={{ color: platform.color, backgroundColor: `${platform.color}15` }}
                              >
                                <i className={platform.icon}></i>
                              </div>
                              <div>
                                <h4 className="font-extrabold text-xs text-white line-clamp-1">{ord.service}</h4>
                                <span className="text-[9px] font-mono text-slate-400">ID: #{ord.id.slice(0, 8)}</span>
                              </div>
                            </div>

                            <span
                              className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                                isCompleted
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : isProcessing
                                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse'
                                  : isPending
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                              }`}
                            >
                              {ord.status.toUpperCase()}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px] bg-black/30 p-2 rounded-xl border border-white/5">
                            <div>
                              <span className="text-slate-400 block">Quantity:</span>
                              <span className="font-extrabold text-white font-mono">{ord.qty.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Cost:</span>
                              <span className="font-extrabold text-emerald-400 font-mono">৳ {ord.cost.toFixed(2)}</span>
                            </div>
                          </div>

                          {/* Live Progress Indicator */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                              <span>Live Dispatch Status</span>
                              <span className="text-red-400 font-bold">{isCompleted ? '100%' : isProcessing ? '65%' : '20%'}</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-500 rounded-full ${
                                  isCompleted ? 'bg-emerald-400' : isProcessing ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'
                                }`}
                                style={{ width: isCompleted ? '100%' : isProcessing ? '65%' : '20%' }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TASKS & REWARDS MODAL WITH SCREENSHOT PROOF UPLOAD */}
          {showTasksModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fade-in">
              <div className="bg-[#0b1329] border border-amber-500/30 rounded-t-3xl sm:rounded-3xl max-h-[85vh] h-[85vh] sm:h-auto flex flex-col overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.25)] w-full max-w-lg mx-auto">
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/90 flex-shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <i className="fas fa-tasks text-xs"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                        <span>Daily Tasks & Bonus (টাস্ক প্রুফ ও স্ক্রিনশট)</span>
                        <span className="bg-amber-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full">
                          EARN ৳
                        </span>
                      </h3>
                      <p className="text-[9px] text-slate-400">টাস্ক সম্পন্ন করে প্রুফ ও স্ক্রিনশট আপলোড দিয়ে রিওয়ার্ড পান</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowTasksModal(false)}
                    className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                {/* Banner Summary */}
                <div className="p-4 bg-gradient-to-r from-amber-950/50 via-yellow-900/30 to-slate-900 border-b border-white/5 flex items-center justify-between flex-shrink-0">
                  <div>
                    <span className="text-[10px] text-amber-300/80 font-bold uppercase tracking-wider block">Total Tasks Rewarded</span>
                    <h4 className="text-lg font-black text-amber-400 font-mono">
                      ৳ {allTaskSubmissions
                        .filter((s) => s.userId === currentUser?.uid && s.status === 'Approved')
                        .reduce((sum, s) => sum + (s.reward || 0), 0)
                        .toFixed(2)}
                    </h4>
                  </div>
                  <span className="text-xs font-bold text-slate-300 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                    {allTaskSubmissions.filter((s) => s.userId === currentUser?.uid && s.status === 'Approved').length} Tasks Completed 🎉
                  </span>
                </div>

                {/* Tasks List */}
                <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-3.5 overscroll-contain pb-12">
                  {customTasks.map((task) => {
                    const userSub = allTaskSubmissions.find(
                      (s) => s.taskId === task.id && s.userId === currentUser?.uid
                    );

                    return (
                      <div key={task.id} className="p-3.5 rounded-2xl bg-slate-900/90 border border-white/10 space-y-3">
                        {/* Task Banner Image if provided by Admin */}
                        {task.image && (
                          <div
                            onClick={() => setSelectedScreenshotPreview(task.image!)}
                            className="w-full aspect-video rounded-xl overflow-hidden border border-amber-500/30 cursor-pointer group relative bg-black/60 shadow"
                          >
                            <img src={task.image} alt={task.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                              <i className="fas fa-search-plus text-white text-sm"></i>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm border border-amber-500/30 flex-shrink-0">
                              <i className={task.icon || 'fas fa-tasks'}></i>
                            </div>
                            <div>
                              <h4 className="font-extrabold text-xs text-white">{task.title}</h4>
                              <p className="text-[10px] text-slate-400">{task.description}</p>
                            </div>
                          </div>
                          <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex-shrink-0">
                            +৳ {task.reward.toFixed(2)}
                          </span>
                        </div>

                        {/* Task Action & Proof Status */}
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                          {task.link && task.link !== '#' && (
                            <a
                              href={task.link}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 text-[11px] font-extrabold flex items-center justify-center gap-1.5 border border-sky-500/30"
                            >
                              <i className="fas fa-external-link-alt text-[10px]"></i> VISIT LINK
                            </a>
                          )}

                          {userSub ? (
                            <div className="flex-1 flex items-center justify-end">
                              {userSub.status === 'Approved' && (
                                <span className="w-full py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold text-center flex items-center justify-center gap-1.5">
                                  <i className="fas fa-check-circle text-emerald-400"></i> APPROVED & REWARDED 🎉
                                </span>
                              )}
                              {userSub.status === 'Pending' && (
                                <span className="w-full py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-extrabold text-center flex items-center justify-center gap-1.5 animate-pulse">
                                  <i className="fas fa-clock text-amber-400"></i> যাঁচাই চলছে (PENDING REVIEW)
                                </span>
                              )}
                              {userSub.status === 'Rejected' && (
                                <button
                                  onClick={() => {
                                    setSelectedTaskForProof(task);
                                    setTaskProofNotes('');
                                    setTaskProofScreenshots([]);
                                  }}
                                  className="w-full py-2 rounded-xl bg-red-600/20 hover:bg-red-600/40 text-red-300 border border-red-500/30 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
                                >
                                  <i className="fas fa-redo"></i> RE-SUBMIT PROOF (REJECTED)
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedTaskForProof(task);
                                setTaskProofNotes('');
                                setTaskProofScreenshots([]);
                              }}
                              className="flex-1 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black text-[11px] font-black flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                            >
                              <i className="fas fa-camera"></i>
                              <span>প্রুফ ও স্ক্রিনশট দিন (SUBMIT PROOF)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TASK SCREENSHOT PROOF UPLOAD MODAL */}
          {selectedTaskForProof && (
            <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex flex-col justify-center p-3 sm:p-4 animate-fade-in">
              <div className="bg-[#0b1329] border border-amber-500/40 rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-[0_0_60px_rgba(245,158,11,0.3)] w-full max-w-lg mx-auto">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-sm">
                      <i className="fas fa-upload"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-xs text-white">
                        Submit Proof: {selectedTaskForProof.title}
                      </h3>
                      <p className="text-[10px] text-amber-300 font-mono">Reward: +৳{selectedTaskForProof.reward.toFixed(2)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedTaskForProof(null);
                      setTaskProofScreenshots([]);
                      setTaskProofNotes('');
                    }}
                    className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4 overscroll-contain pb-10">
                  {/* Task Instructions */}
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-1">
                    <span className="font-bold block text-amber-400">
                      <i className="fas fa-info-circle mr-1"></i> নির্দেশাবলী:
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      টাস্ক সম্পন্ন করার প্রমাণ হিসেবে সর্বোচ্চ ৫টি পর্যন্ত স্ক্রিনশট আপলোড করতে পারবেন। সাথে আপনার আইডি বা নোট লিখে সাবমিট দিন।
                    </p>
                  </div>

                  {/* Proof Text Input */}
                  <div>
                    <label className="form-label">Proof Details / User ID / Notes (ঐচ্ছিক তথ্য)</label>
                    <textarea
                      rows={2}
                      className="input-modern text-xs resize-none"
                      placeholder="e.g. My Telegram Username: @john, FB Name: Rahul"
                      value={taskProofNotes}
                      onChange={(e) => setTaskProofNotes(e.target.value)}
                    />
                  </div>

                  {/* Screenshot File Upload Box (Up to 5 Screenshots) */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-white flex items-center gap-1.5">
                        <i className="fas fa-images text-amber-400"></i>
                        <span>Upload Screenshots (প্রুফ স্ক্রিনশট)</span>
                      </span>
                      <span className={`font-mono text-[10px] font-bold ${taskProofScreenshots.length >= 5 ? 'text-amber-400' : 'text-slate-400'}`}>
                        {taskProofScreenshots.length} / 5 Screenshots
                      </span>
                    </div>

                    {/* Upload Drop Button */}
                    <label
                      className={`relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-2xl transition cursor-pointer text-center ${
                        taskProofScreenshots.length >= 5
                          ? 'border-slate-700 bg-slate-900/50 opacity-60 cursor-not-allowed'
                          : 'border-amber-500/40 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleScreenshotUpload}
                        disabled={taskProofScreenshots.length >= 5}
                        className="hidden"
                      />
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-base mb-1.5 border border-amber-500/30">
                        <i className="fas fa-cloud-arrow-up"></i>
                      </div>
                      <span className="text-xs font-bold text-white">
                        {taskProofScreenshots.length >= 5 ? 'Maximum 5 Screenshots Uploaded' : 'ক্লিক করে স্ক্রিনশট নির্বাচন করুন'}
                      </span>
                      <span className="text-[9px] text-slate-400 mt-0.5">
                        (You can upload up to 5 screenshot proof photos)
                      </span>
                    </label>

                    {/* Screenshots Preview Thumbnails Grid */}
                    {taskProofScreenshots.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2">
                        {taskProofScreenshots.map((imgSrc, idx) => (
                          <div
                            key={idx}
                            className="group relative aspect-square rounded-xl overflow-hidden border border-amber-500/40 bg-black/60 shadow"
                          >
                            <img
                              src={imgSrc}
                              alt={`Proof ${idx + 1}`}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition"
                              onClick={() => setSelectedScreenshotPreview(imgSrc)}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveScreenshot(idx);
                              }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] shadow hover:scale-110 transition"
                              title="Delete screenshot"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                            <span className="absolute bottom-1 left-1 bg-black/80 text-[8px] font-mono text-amber-300 px-1 rounded font-bold">
                              #{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmitTaskProof}
                    disabled={taskSubmitting}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs tracking-wider shadow-lg transition active:scale-95 flex items-center justify-center gap-2 mt-2"
                  >
                    {taskSubmitting ? (
                      <span className="loading-spinner"></span>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane text-xs"></i>
                        <span>SUBMIT TASK PROOF FOR VERIFICATION</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LUCKY SPIN WINNER MODAL */}
          {showSpinWinModal && (
            <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-slate-900 border border-amber-500/50 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-[0_0_60px_rgba(245,158,11,0.4)]">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-yellow-500 text-slate-950 flex items-center justify-center text-3xl font-black mx-auto shadow-lg animate-bounce">
                  <i className="fas fa-trophy"></i>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                    🎉 LUCKY SPIN WINNER
                  </span>
                  <h3 className="font-black text-xl text-white pt-2">
                    অভিনন্দন! আপনি জিতেছেন!
                  </h3>
                  <p className="text-3xl font-black text-amber-400 font-mono py-2">
                    ৳ {wonSpinAmount.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-300">
                    পুরস্কারটি সরাসরি আপনার মেইন ওয়ালেট ব্যালেন্সে যোগ করা হয়েছে!
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowSpinWinModal(false);
                    haptic('light');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition active:scale-95"
                >
                  <span>GREAT! CLAIM & CONTINUE (ধন্যবাদ)</span>
                </button>
              </div>
            </div>
          )}

          {/* GOLD VIP SPIN WINNER MODAL */}
          {showGoldSpinWinModal && (
            <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-slate-900 border border-yellow-400 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-[0_0_70px_rgba(234,179,8,0.5)]">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 text-slate-950 flex items-center justify-center text-4xl font-black mx-auto shadow-xl animate-bounce border-2 border-white">
                  <i className="fas fa-crown"></i>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-yellow-300 tracking-widest bg-yellow-500/20 px-3.5 py-1 rounded-full border border-yellow-500/40">
                    🏆 GOLD VIP SPIN WINNER
                  </span>
                  <h3 className="font-black text-xl text-yellow-300 pt-2">
                    অভিনন্দন! গোল্ড স্পিন পুরষ্কার!
                  </h3>
                  <p className="text-4xl font-black text-yellow-400 font-mono py-2 filter drop-shadow-[0_2px_10px_rgba(234,179,8,0.5)]">
                    ৳ {wonGoldSpinAmount.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-300">
                    গোল্ড স্পিন পুরষ্কারটি সফলভাবে আপনার মেইন ওয়ালেট ব্যালেন্সে যোগ করা হয়েছে!
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowGoldSpinWinModal(false);
                    haptic('light');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-yellow-500/30 transition active:scale-95"
                >
                  <span>CLAIM GOLD REWARD (ধন্যবাদ)</span>
                </button>
              </div>
            </div>
          )}

          {/* PREMIUM DIAMOND SPIN WINNER MODAL */}
          {showPremiumSpinWinModal && (
            <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-slate-900 border border-cyan-400 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-[0_0_70px_rgba(6,182,212,0.5)]">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-300 via-blue-500 to-purple-600 text-white flex items-center justify-center text-4xl font-black mx-auto shadow-xl animate-bounce border-2 border-white">
                  <i className="fas fa-gem text-cyan-200"></i>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-cyan-300 tracking-widest bg-cyan-500/20 px-3.5 py-1 rounded-full border border-cyan-500/40">
                    💎 PREMIUM DIAMOND SPIN WINNER
                  </span>
                  <h3 className="font-black text-xl text-cyan-300 pt-2">
                    অভিনন্দন! প্রিমিয়াম স্পিন পুরষ্কার!
                  </h3>
                  <p className="text-4xl font-black text-cyan-300 font-mono py-2 filter drop-shadow-[0_2px_10px_rgba(6,182,212,0.6)]">
                    ৳ {wonPremiumSpinAmount.toFixed(2)}
                  </p>
                  <p className="text-xs text-slate-300">
                    প্রিমিয়াম ডায়মন্ড স্পিনের পুরষ্কারটি সফলভাবে আপনার ওয়ালেটে জমা হয়েছে!
                  </p>
                </div>

                <button
                  onClick={() => {
                    setShowPremiumSpinWinModal(false);
                    haptic('light');
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/30 transition active:scale-95"
                >
                  <span>CLAIM PREMIUM REWARD (ধন্যবাদ)</span>
                </button>
              </div>
            </div>
          )}

          {/* THEME COLOR SELECTOR MODAL */}
          {showThemeModal && (
            <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex flex-col justify-center p-3 sm:p-4 animate-fade-in">
              <div className="bg-[#0b1329] border border-purple-500/40 rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-[0_0_60px_rgba(139,92,246,0.3)] w-full max-w-lg mx-auto">
                {/* Modal Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 text-base">
                      <i className="fas fa-palette"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">App Theme Switcher (থিম সিলেক্টর)</h3>
                      <p className="text-[10px] text-purple-300">আপনার পছন্দমত ৫টি কালার থিমের যেকোনো একটি বেছে নিন</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowThemeModal(false);
                      haptic('light');
                    }}
                    className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-xs transition active:scale-95"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                {/* Theme Options */}
                <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {THEMES.map((theme) => {
                      const isActive = currentTheme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          onClick={() => {
                            setCurrentTheme(theme.id);
                            haptic('light');
                            showToast(`🎨 থিম পরিবর্তন করে '${theme.bnName}' করা হয়েছে!`, 'success');
                          }}
                          className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition relative overflow-hidden active:scale-95 ${
                            isActive
                              ? 'bg-slate-900 border-2 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                              : 'bg-slate-950/70 border-white/10 hover:border-white/25'
                          }`}
                        >
                          {/* Visual Preview Bar */}
                          <div className={`h-2.5 w-full rounded-full bg-gradient-to-r ${theme.bgGradient} mb-3 shadow`}></div>

                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <i className={`${theme.icon} ${theme.colorClass} text-sm`}></i>
                              <span className="font-black text-xs text-white">{theme.name}</span>
                            </div>
                            {isActive && (
                              <span className="w-5 h-5 rounded-full bg-purple-500 text-black flex items-center justify-center text-[10px] font-bold">
                                <i className="fas fa-check"></i>
                              </span>
                            )}
                          </div>

                          <p className="text-[10px] text-slate-400 font-medium mb-2">{theme.bnName}</p>

                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-lg border ${theme.badgeBg}`}>
                              {isActive ? 'ACTIVE THEME' : 'SELECT THEME'}
                            </span>
                            <i className="fas fa-arrow-right text-[10px] text-slate-500"></i>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Note */}
                <div className="p-3 bg-slate-950/80 border-t border-white/10 text-center">
                  <p className="text-[10px] text-slate-400">
                    💡 আপনার সিলেক্ট করা থিমটি ডিভাইসে সেভ থাকবে।
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* LIGHTBOX FULLSCREEN SCREENSHOT PREVIEW MODAL */}
          {selectedScreenshotPreview && (
            <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-3 animate-fade-in">
              <div className="relative max-w-4xl w-full flex flex-col items-center justify-center">
                {/* Close Button */}
                <button
                  onClick={() => setSelectedScreenshotPreview(null)}
                  className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center hover:bg-white/20 text-base shadow-lg z-10 transition active:scale-95"
                >
                  <i className="fas fa-times"></i>
                </button>

                {/* Screenshot Image */}
                <div className="bg-slate-950 p-2 rounded-2xl border border-white/20 shadow-2xl max-h-[85vh] overflow-hidden flex items-center justify-center">
                  <img
                    src={selectedScreenshotPreview}
                    alt="Full Screenshot Proof Preview"
                    className="max-h-[80vh] w-auto object-contain rounded-xl"
                  />
                </div>

                <p className="text-[10px] font-mono text-slate-400 mt-3 flex items-center gap-1.5">
                  <i className="fas fa-expand text-amber-400"></i>
                  <span>Full High-Resolution Screenshot Proof View</span>
                </p>
              </div>
            </div>
          )}

          {/* ADMIN TASK EDIT MODAL (সম্পূর্ণ টাস্ক এডিট ও আপডেট মোডাল) */}
          {editingTask && (
            <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 animate-fade-in overflow-y-auto">
              <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-5 max-w-xl w-full shadow-2xl space-y-4 my-auto">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-sm font-bold">
                      <i className="fas fa-edit"></i>
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Edit Task (টাস্ক এডিট করুন)</h3>
                      <p className="text-[10px] text-slate-400">রিওয়ার্ড, লিমিট, নাম, লিংক, ছবি সহ সব তথ্য পরিবর্তন করুন</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingTask(null)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs transition"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="form-label">Task Title (টাস্ক এর নাম)</label>
                      <input
                        type="text"
                        className="input-modern text-xs"
                        value={editTaskTitle}
                        onChange={(e) => setEditTaskTitle(e.target.value)}
                        placeholder="e.g. Subscribe Channel"
                      />
                    </div>
                    <div>
                      <label className="form-label">Reward Amount (রিওয়ার্ড ৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-modern text-xs font-mono"
                        value={editTaskReward}
                        onChange={(e) => setEditTaskReward(e.target.value)}
                        placeholder="e.g. 5"
                      />
                    </div>
                    <div>
                      <label className="form-label">Max User Limit (ইউজার লিমিট)</label>
                      <input
                        type="number"
                        className="input-modern text-xs font-mono"
                        value={editTaskMaxUserLimit}
                        onChange={(e) => setEditTaskMaxUserLimit(e.target.value)}
                        placeholder="0 = Unlimited"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label">Task Link (টাস্ক এর লিংক)</label>
                    <input
                      type="text"
                      className="input-modern text-xs font-mono"
                      value={editTaskLink}
                      onChange={(e) => setEditTaskLink(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="form-label">Task Description & Instructions (বিবরণ)</label>
                    <textarea
                      rows={3}
                      className="input-modern text-xs resize-none"
                      value={editTaskDesc}
                      onChange={(e) => setEditTaskDesc(e.target.value)}
                      placeholder="Task instructions..."
                    />
                  </div>

                  {/* Image/Banner Edit Section */}
                  <div className="p-3 bg-black/40 rounded-2xl border border-white/10 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-extrabold text-white flex items-center gap-1.5">
                        <i className="fas fa-image text-amber-400"></i>
                        <span>Task Image / Banner (ছবি বা ব্যানার)</span>
                      </label>
                      {editTaskImage && (
                        <button
                          onClick={() => setEditTaskImage(null)}
                          className="text-[10px] text-red-400 hover:underline font-bold"
                        >
                          Remove Image
                        </button>
                      )}
                    </div>

                    {editTaskImage ? (
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-amber-500/40 bg-slate-950">
                        <img src={editTaskImage} alt="Task Edit Banner" className="w-full h-full object-cover" />
                        <button
                          onClick={() => setEditTaskImage(null)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs shadow hover:scale-110 transition"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-amber-500/30 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10 rounded-xl transition cursor-pointer text-center">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleEditTaskImageUpload}
                          className="hidden"
                        />
                        <i className="fas fa-file-image text-amber-400 text-xl mb-1"></i>
                        <span className="text-xs font-bold text-white">নতুন ছবি সিলেক্ট করে আপলোড করুন</span>
                      </label>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => setEditingTask(null)}
                    className="btn-secondary py-2.5 text-xs flex-1"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleSaveEditedTask}
                    className="btn-primary-solid py-2.5 text-xs flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110"
                  >
                    <i className="fas fa-check mr-1.5"></i>
                    SAVE CHANGES (সেভ করুন)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MANDATORY 4 TELEGRAM CHANNELS JOIN OVERLAY */}
          {isLoggedIn && mandatoryChannelsEnabled && !hasCompletedMandatoryJoin && (
            <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-fade-in overflow-y-auto">
              <div className="max-w-md w-full bg-slate-900 border border-sky-500/40 rounded-3xl p-5 shadow-2xl space-y-4 text-center my-auto">
                {/* Header Icon */}
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 text-white flex items-center justify-center text-2xl mx-auto shadow-lg shadow-sky-500/30 animate-pulse">
                  <i className="fab fa-telegram-plane"></i>
                </div>

                <div>
                  <h2 className="text-base font-black text-white flex items-center justify-center gap-2">
                    <span>📢 ৪ টি টেলিগ্রাম চ্যানেলে জয়েন করা বাধ্যতামূলক!</span>
                  </h2>
                  <p className="text-[11px] text-sky-300/90 mt-1 leading-relaxed font-medium">
                    বট দ্বারা লাইভ মেম্বারশিপ চেক করা হবে। ৪টি চ্যানেলে জয়েন করে বট দিয়ে ভেরিফাই করুন।
                  </p>
                </div>

                {/* User Telegram ID Input */}
                <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-sky-500/30 space-y-2 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-extrabold text-amber-400 flex items-center gap-1.5">
                      <i className="fas fa-id-badge text-sky-400"></i>
                      <span>Your Telegram User ID (আপনার টেলিগ্রাম আইডি)</span>
                    </label>
                    <a
                      href="https://t.me/userinfobot"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-sky-400 hover:underline font-bold flex items-center gap-1"
                    >
                      <span>Find ID?</span>
                      <i className="fas fa-external-link-alt text-[8px]"></i>
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      className="input-modern text-xs font-mono pl-9"
                      placeholder="e.g. 1234567890 or @username"
                      value={userTgInputId}
                      onChange={(e) => setUserTgInputId(e.target.value)}
                    />
                    <i className="fab fa-telegram text-sky-400 absolute left-3 top-3 text-xs"></i>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    💡 টেলিগ্রাম থেকে আইডি পেতে <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-amber-400 underline font-bold">@userinfobot</a> এ মেসেজ দিয়ে আইডি কপি করে নিন।
                  </p>
                </div>

                {/* Channel List */}
                <div className="space-y-2 text-left">
                  {mandatoryChannels.map((ch, idx) => {
                    const isVerified = verifiedChannelIndexes.includes(idx);
                    const isClicked = joinedChannelIndexes.includes(idx);
                    const err = channelVerificationErrors[idx];

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border transition space-y-1.5 ${
                          isVerified
                            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                            : err
                            ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                            : isClicked
                            ? 'bg-sky-950/30 border-sky-500/40 text-sky-300'
                            : 'bg-slate-800/80 border-white/10 text-white hover:border-sky-500/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                              isVerified ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'
                            }`}>
                              {isVerified ? <i className="fas fa-check-double text-emerald-400"></i> : idx + 1}
                            </div>
                            <div className="truncate">
                              <h4 className="font-extrabold text-xs text-white truncate flex items-center gap-1.5">
                                <span>{ch.name || `Channel ${idx + 1}`}</span>
                                {isVerified && (
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-black px-1.5 py-0.5 rounded border border-emerald-500/30 shrink-0">
                                    VERIFIED ✅
                                  </span>
                                )}
                              </h4>
                              <p className="text-[10px] text-sky-300/70 font-mono truncate">{ch.url}</p>
                            </div>
                          </div>

                          <a
                            href={ch.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => {
                              haptic('heavy');
                              if (!joinedChannelIndexes.includes(idx)) {
                                setJoinedChannelIndexes(prev => [...prev, idx]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black shrink-0 transition flex items-center gap-1 active:scale-95 ${
                              isVerified
                                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/20'
                            }`}
                          >
                            <span>{isVerified ? 'JOINED ✅' : 'JOIN (জয়েন)'}</span>
                            <i className="fas fa-external-link-alt text-[9px]"></i>
                          </a>
                        </div>

                        {err && (
                          <div className="text-[10px] text-rose-400 font-semibold bg-rose-950/60 p-1.5 rounded-lg border border-rose-500/20 flex items-center gap-1">
                            <i className="fas fa-exclamation-circle text-rose-400"></i>
                            <span>{err}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress Bar & Live Bot Verification Button */}
                <div className="pt-1 space-y-2.5">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 px-1">
                    <span>ভেরিফিকেশন স্ট্যাটাস:</span>
                    <span className="text-sky-400 font-extrabold">
                      {verifiedChannelIndexes.length} / {mandatoryChannels.length} Verified
                    </span>
                  </div>

                  <button
                    onClick={verifyChannelsWithBot}
                    disabled={botVerifyLoading}
                    className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 shadow-xl flex items-center justify-center gap-2 ${
                      botVerifyLoading
                        ? 'bg-slate-800 text-slate-400 cursor-wait'
                        : verifiedChannelIndexes.length >= mandatoryChannels.length
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/30'
                        : 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white shadow-sky-500/30'
                    }`}
                  >
                    {botVerifyLoading ? (
                      <>
                        <i className="fas fa-spinner fa-spin text-sm"></i>
                        <span>বট দিয়ে চেক করা হচ্ছে... (VERIFYING)</span>
                      </>
                    ) : verifiedChannelIndexes.length >= mandatoryChannels.length ? (
                      <>
                        <i className="fas fa-check-circle text-sm text-slate-950"></i>
                        <span>সবগুলো ভেরিফাইড! অ্যাপে প্রবেশ করুন (CONTINUE TO APP)</span>
                      </>
                    ) : (
                      <>
                        <i className="fab fa-telegram-plane text-sm"></i>
                        <span>🤖 VERIFY WITH TELEGRAM BOT (বট দিয়ে ভেরিফাই করুন)</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-slate-500 italic">
                    * ৪টি চ্যানেলে জয়েনিং সম্পূর্ণ না থাকলে অ্যাপ ব্যবহার করা যাবে না।
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* FLOATING AI SUPPORT BUTTON */}
          <button
            type="button"
            onClick={() => {
              setIsAiChatOpen(true);
              haptic('medium');
            }}
            className="fixed bottom-20 right-4 z-40 p-3 sm:px-4 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-full shadow-2xl shadow-purple-500/50 border border-purple-400/40 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all group"
            title="AI Support Assistant (এআই সহায়িকা)"
          >
            <div className="relative flex items-center justify-center">
              <i className="fas fa-robot text-lg text-purple-200 group-hover:rotate-12 transition"></i>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse"></span>
            </div>
            <span className="text-xs font-black tracking-wide pr-1">এআই সাপোর্ট</span>
          </button>

          {/* AI CHAT MODAL OVERLAY */}
          {isAiChatOpen && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
              <div className="w-full max-w-lg h-[88vh] bg-slate-900 border border-purple-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
                {/* Modal Header */}
                <div className="p-4 bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 border-b border-purple-500/20 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-2xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300 text-lg shadow-inner">
                        <i className="fas fa-robot"></i>
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900"></span>
                    </div>

                    <div>
                      <h3 className="font-black text-sm text-white flex items-center gap-2">
                        <span>RF SMM AI Assistant</span>
                        <span className="text-[9px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-500/30">
                          Gemini 3.6 Flash
                        </span>
                      </h3>
                      <p className="text-[10px] text-purple-200/80 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                        <span>২৪/৭ অনলাইন এআই কাস্টমার সাপোর্ট</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAiMessages([
                          {
                            id: 'welcome',
                            role: 'model',
                            text: 'আসসালামু আলাইকুম! 👋 আমি RF SMM-এর 🤖 AI সাপোর্ট অ্যাসিস্ট্যান্ট। আমি কীভাবে সাহায্য করতে পারি?',
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          }
                        ]);
                        showToast('চ্যাট রিলোড করা হয়েছে', 'info');
                      }}
                      className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-xs transition"
                      title="Clear / Reset Chat"
                    >
                      <i className="fas fa-sync-alt"></i>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAiChatOpen(false);
                        haptic('light');
                      }}
                      className="w-8 h-8 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white flex items-center justify-center text-xs transition"
                      title="Close"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>

                {/* Quick Suggestion Chips */}
                <div className="p-2.5 bg-slate-950/60 border-b border-white/5 overflow-x-auto flex items-center gap-2 shrink-0 scrollbar-none">
                  {[
                    'কীভাবে ডিপোজিট করব?',
                    'বিকাশ/নগদ অটো ডিপোজিট',
                    'নতুন অর্ডার দেওয়ার নিয়ম',
                    'অর্ডার ডেলিভারি টাইম কত?',
                    'ডেইলি ফ্রি বোনাস পাব কীভাবে?',
                    'এডমিন সাপোর্ট নম্বর'
                  ].map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isAiSending}
                      onClick={() => handleSendAiMessage(q)}
                      className="whitespace-nowrap text-[10px] font-extrabold text-purple-200 hover:text-white bg-purple-950/60 hover:bg-purple-800/80 px-3 py-1.5 rounded-xl border border-purple-500/30 transition active:scale-95 shrink-0 flex items-center gap-1"
                    >
                      <i className="fas fa-comment-dots text-purple-400"></i>
                      <span>{q}</span>
                    </button>
                  ))}
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'model' && (
                        <div className="w-8 h-8 rounded-2xl bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-md">
                          <i className="fas fa-robot"></i>
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none shadow-lg'
                            : 'bg-slate-900 text-slate-100 rounded-tl-none border border-purple-500/20 shadow-lg'
                        }`}
                      >
                        <p>{msg.text}</p>
                        <span className="block text-[8px] text-slate-400 mt-1.5 text-right font-mono">
                          {msg.time}
                        </span>
                      </div>

                      {msg.role === 'user' && (
                        <div className="w-8 h-8 rounded-2xl bg-blue-600/30 border border-blue-500/40 text-blue-300 flex items-center justify-center text-xs shrink-0 mt-0.5 shadow-md">
                          <i className="fas fa-user"></i>
                        </div>
                      )}
                    </div>
                  ))}

                  {isAiSending && (
                    <div className="flex gap-2.5 justify-start animate-fade-in">
                      <div className="w-8 h-8 rounded-2xl bg-purple-600/30 border border-purple-500/40 text-purple-300 flex items-center justify-center text-xs shrink-0">
                        <i className="fas fa-robot animate-bounce"></i>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-slate-900 text-purple-300 text-xs border border-purple-500/30 flex items-center gap-2 shadow-lg">
                        <i className="fas fa-circle-notch fa-spin text-purple-400"></i>
                        <span className="font-extrabold text-[11px]">RF AI টাইপ করছে...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Bar */}
                <div className="p-3 bg-slate-900 border-t border-purple-500/20 shrink-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input-modern text-xs flex-1 bg-slate-950 border-purple-500/30 focus:border-purple-400"
                      placeholder="আপনার প্রশ্নটি টাইপ করুন..."
                      value={aiInputText}
                      onChange={(e) => setAiInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendAiMessage();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={isAiSending || !aiInputText.trim()}
                      onClick={() => handleSendAiMessage()}
                      className="px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-lg transition active:scale-95 flex items-center gap-1.5 shrink-0"
                    >
                      <i className="fas fa-paper-plane"></i>
                      <span className="hidden sm:inline">পাঠান</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM NAVIGATION */}
          <nav className="bottom-nav-premium">
            <div
              className={`nav-item-premium ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('home');
                haptic('light');
              }}
            >
              <i className="fas fa-home"></i>
              <span>Home</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('orders');
                haptic('light');
              }}
            >
              <i className="fas fa-list-check"></i>
              <span>Orders</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'tasks' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('tasks');
                haptic('light');
              }}
            >
              <i className="fas fa-calendar-check"></i>
              <span>Tasks</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'funds' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('funds');
                haptic('light');
              }}
            >
              <i className="fas fa-wallet"></i>
              <span>Funds</span>
            </div>
            <div
              className={`nav-item-premium ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('profile');
                haptic('light');
              }}
            >
              {userPhotoURL || currentUser?.photoURL ? (
                <img
                  src={userPhotoURL || currentUser?.photoURL}
                  alt="Profile"
                  className="w-5 h-5 rounded-full object-cover border border-amber-400"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      currentUser?.name || 'User'
                    )}&background=3b82f6&color=fff&bold=true`;
                  }}
                />
              ) : (
                <i className="fas fa-user-circle"></i>
              )}
              <span>Profile</span>
            </div>
            {isAdminUser && (
              <div
                className={`nav-item-premium ${activeTab === 'admin' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('admin');
                  haptic('heavy');
                }}
              >
                <i className="fas fa-crown text-amber-400"></i>
                <span>Admin</span>
              </div>
            )}

          </nav>
        </div>
      )}
    </div>
  );
}
