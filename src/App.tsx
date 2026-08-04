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
  trxId: string;
  method: string;
  status: string;
  timestamp?: any;
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
}

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
  const [userBalance, setUserBalance] = useState(0);
  const [userTotalOrders, setUserTotalOrders] = useState(0);
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  // Check if current logged in user is admin (rashal117)
  const isAdminUser = Boolean(
    currentUser && (
      currentUser.username?.toLowerCase() === 'rashal117' ||
      currentUser.name?.toLowerCase() === 'rashal117'
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
  const [selectedMethod, setSelectedMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'binance' | 'usdt_bep20'>('bkash');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositTrxId, setDepositTrxId] = useState<string>('');
  const [depAmtErr, setDepAmtErr] = useState('');
  const [depTrxErr, setDepTrxErr] = useState('');
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositHistory, setDepositHistory] = useState<DepositRequest[]>([]);
  const [allDepositRequests, setAllDepositRequests] = useState<DepositRequest[]>([]);

  // Admin Manual Service Form & Control State
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'payment' | 'deposits' | 'orders' | 'services' | 'notifications' | 'links' | 'settings' | 'tasks'>('users');
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState<
    Record<string, { label: string; number: string; icon: string; note?: string; isCrypto?: boolean }>
  >({
    bkash: { label: 'bKash Merchant', number: '01781119650', icon: 'b' },
    nagad: { label: 'Nagad Merchant', number: '01781119650', icon: 'N' },
    rocket: { label: 'Rocket Personal', number: '01781119650', icon: 'R' },
    binance: { label: 'Binance Pay / UID', number: '584304364', icon: 'B', note: '0.10$ = 12 TK ($1 = 120 TK)', isCrypto: true },
    usdt_bep20: { label: 'USDT (BEP20 Network)', number: '0x5764a28569ef6efdce93db22656b297ab487cdaa', icon: 'U', note: '0.10$ = 12 TK ($1 = 120 TK)', isCrypto: true }
  });
  const [editingPaymentNumbers, setEditingPaymentNumbers] = useState<Record<string, { number: string; note: string }>>({});
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
            errorsMap[i] = 'মেম্বারশিপ চেকের জন্য সংখ্যাভিত্তিক Telegram User ID দিন (যেমন: 8479465879)';
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
  const [newTaskLink, setNewTaskLink] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState('fas fa-tasks');
  const [newTaskImage, setNewTaskImage] = useState<string | null>(null);

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

    const newTaskDoc = {
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim() || 'Complete task & submit screenshot proof',
      reward: rewardVal,
      link: newTaskLink.trim() || '#',
      icon: newTaskIcon || 'fas fa-tasks',
      image: newTaskImage || ''
    };

    try {
      const docRef = await addDoc(collection(db, 'tasks'), newTaskDoc);
      setCustomTasks((prev) => [{ id: docRef.id, ...newTaskDoc }, ...prev]);
      showToast('✅ New task created successfully!', 'success');
      haptic('success');
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskReward('5');
      setNewTaskLink('');
      setNewTaskImage(null);
    } catch (e: any) {
      console.error('Error creating task:', e);
      showToast('Failed to create task: ' + e.message, 'error');
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

  // Admin Deposit Approval (with customizable amount adjustment before approval)
  const handleApproveDepositCustom = async (depId: string, uid: string, originalAmount: number) => {
    const customStr = customDepAmounts[depId];
    const finalAmount = customStr !== undefined && !isNaN(parseFloat(customStr)) && parseFloat(customStr) >= 0
      ? parseFloat(customStr)
      : originalAmount;

    try {
      const uSnap = await getDoc(doc(db, 'users', uid));
      const currBal = uSnap.exists() ? (uSnap.data().balance || 0) : 0;
      const newBal = currBal + finalAmount;

      await updateDoc(doc(db, 'users', uid), { balance: newBal });
      await updateDoc(doc(db, 'deposit_requests', depId), {
        status: 'Approved',
        amount: finalAmount,
        approvedAt: serverTimestamp()
      });

      showToast(`Approved ৳${finalAmount} for user ${uid.slice(0, 8)}!`, 'success');
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

  // Save/Update Payment Method Number in Firestore
  const handleSavePaymentNumber = async (methodKey: string, newNumber: string, newNote?: string) => {
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
          ...(newNote !== undefined ? { note: newNote.trim() } : {})
        }
      };
      await setDoc(doc(db, 'settings', 'payment_methods'), updated, { merge: true });
      setPaymentMethodsConfig(updated);
      showToast(`✅ Updated ${paymentMethodsConfig[methodKey]?.label || methodKey} number to: ${newNumber.trim()}`, 'success');
      haptic('success');
    } catch (e: any) {
      console.error('Error saving payment number:', e);
      showToast('Failed to save payment number: ' + e.message, 'error');
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

    try {
      const q = query(collection(db, 'auth_users'), where('telegramId', '==', tgUser.id));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        const session = { uid: userDoc.id, username: userData.username, name: userData.name };
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
          telegramId: tgUser.id
        });

        await setDoc(
          doc(db, 'users', uid),
          { name, balance: 0, total_orders: 0, createdAt: serverTimestamp() },
          { merge: true }
        );

        const session = { uid, username: finalUsername, name };
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

  // Submit Deposit Request
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

    setDepositSubmitting(true);
    haptic('heavy');

    try {
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
      setDepositAmount('');
      setDepositTrxId('');
    } catch (e: any) {
      console.error('Deposit error:', e);
      haptic('error');
      showToast('Failed to submit deposit request', 'error');
    } finally {
      setDepositSubmitting(false);
    }
  };

  const copyNumber = (num: string) => {
    navigator.clipboard.writeText(num);
    haptic('success');
    showToast('Number copied to clipboard!', 'success');
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
      const uRef = doc(db, 'users', dep.uid);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        const curBal = uSnap.data().balance || 0;
        await updateDoc(uRef, { balance: curBal + dep.amount });
      } else {
        await setDoc(uRef, { balance: dep.amount, total_orders: 0, createdAt: serverTimestamp() });
      }

      await updateDoc(doc(db, 'deposit_requests', dep.id), { status: 'Approved' });
      showToast(`✅ Approved ৳${dep.amount} deposit for ${dep.trxId}`, 'success');
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
                    />
                  ) : (
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                        currentUser?.name || 'User'
                      )}&background=3b82f6&color=fff&bold=true`}
                      className="w-12 h-12 rounded-xl object-cover shadow-lg border-2 border-white/10 group-hover:scale-105 transition duration-300"
                      alt="User Avatar"
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
                    title="Admin Panel (এডমিন প্যানেল)"
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

          {/* FUNDS TAB */}
          {activeTab === 'funds' && (
            <section className="px-5 mt-5">
              <h2 className="section-title mb-5 text-white">Add Funds</h2>

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

              {/* Method Selector */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(['bkash', 'nagad', 'rocket', 'binance', 'usdt_bep20'] as const).map((method) => {
                  const cfg = paymentMethodsConfig[method];
                  const isActive = selectedMethod === method;
                  return (
                    <div
                      key={method}
                      onClick={() => {
                        setSelectedMethod(method);
                        haptic('light');
                      }}
                      className={`deposit-method flex flex-col items-center justify-center py-2.5 px-2 text-center cursor-pointer transition rounded-xl border ${
                        isActive
                          ? 'bg-blue-500/20 border-blue-500/50 text-white shadow-lg'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-[11px] font-extrabold uppercase">
                        {method === 'bkash'
                          ? 'bKash'
                          : method === 'nagad'
                          ? 'Nagad'
                          : method === 'rocket'
                          ? 'Rocket'
                          : method === 'binance'
                          ? 'Binance'
                          : 'USDT (BEP20)'}
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

              {/* Payment Box */}
              <div className="glass-card p-4 mb-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-3 items-center min-w-0">
                    <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400 text-lg font-black flex-shrink-0">
                      {paymentMethodsConfig[selectedMethod].icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-slate-500 uppercase">
                        {paymentMethodsConfig[selectedMethod].label}
                      </p>
                      <p className="font-bold text-xs tracking-wide text-white font-mono break-all">
                        {paymentMethodsConfig[selectedMethod].number}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyNumber(paymentMethodsConfig[selectedMethod].number)}
                    className="copy-btn flex-shrink-0"
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
              <div className="glass-card p-5 space-y-4 mb-6">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="form-label mb-0">
                      <i className="fas fa-money-bill mr-1 text-[8px]"></i> Amount (BDT / ৳)
                    </label>
                    <span className="text-[10px] font-bold text-blue-400">
                      Selected: ৳ {parseFloat(depositAmount) || 0}
                    </span>
                  </div>

                  <input
                    type="number"
                    className="input-modern"
                    placeholder={
                      paymentMethodsConfig[selectedMethod].isCrypto
                        ? 'Enter amount in BDT (e.g. 12 TK = $0.10)'
                        : 'Enter amount (min ৳ 10)'
                    }
                    value={depositAmount}
                    onChange={(e) => {
                      setDepositAmount(e.target.value);
                      setDepAmtErr('');
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

                  {depAmtErr && <p className="field-error show">{depAmtErr}</p>}
                </div>

                <div>
                  <label className="form-label">
                    <i className="fas fa-receipt mr-1 text-[8px]"></i>{' '}
                    {paymentMethodsConfig[selectedMethod].isCrypto
                      ? 'Transaction ID / Hash / Pay ID'
                      : 'Transaction ID'}
                  </label>
                  <input
                    type="text"
                    className="input-modern uppercase"
                    placeholder={
                      paymentMethodsConfig[selectedMethod].isCrypto
                        ? 'e.g. 584304364 or TxHash 0x...'
                        : 'e.g. BKASH8S7D6F'
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
                  className="btn-secondary-solid flex items-center justify-center gap-2"
                >
                  {depositSubmitting ? (
                    <span className="loading-spinner"></span>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane text-xs"></i>
                      <span>SUBMIT REQUEST</span>
                    </>
                  )}
                </button>
              </div>

              {/* Deposit History */}
              <div>
                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-3">
                  <i className="fas fa-history mr-1"></i> Recent Requests
                </h3>

                {depositHistory.length === 0 ? (
                  <p className="text-[11px] text-slate-600 text-center py-3">
                    No requests submitted yet
                  </p>
                ) : (
                  depositHistory.map((dep) => (
                    <div key={dep.id} className="deposit-history-card">
                      <div className="flex justify-between items-center mb-1.5">
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
                            dep.status === 'Approved'
                              ? 'text-blue-400 bg-blue-500/10'
                              : dep.status === 'Rejected'
                              ? 'text-red-400 bg-red-500/10'
                              : 'text-amber-400 bg-amber-500/10'
                          }`}
                        >
                          {dep.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                          {dep.method} • {dep.trxId}
                        </span>
                        <span className="font-extrabold text-sm text-white">
                          ৳ {dep.amount}
                        </span>
                      </div>
                    </div>
                  ))
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
                      />
                    ) : (
                      <img
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                          currentUser?.name || 'User'
                        )}&background=3b82f6&color=fff&bold=true&size=200`}
                        alt="Avatar"
                        className="w-full h-full object-cover"
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

                  {/* Remove Photo option if custom photo exists */}
                  {(userPhotoURL || currentUser?.photoURL) && (
                    <button
                      onClick={handleRemoveProfilePic}
                      disabled={profileSubmitting}
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-600/90 text-white flex items-center justify-center text-xs shadow-md hover:scale-110 transition border border-white/20"
                      title="Remove Photo"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
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
                  { id: 'payment', label: 'Payment Numbers', icon: 'fas fa-mobile-alt' },
                  { id: 'deposits', label: 'Deposit Requests', icon: 'fas fa-wallet' },
                  { id: 'orders', label: 'Orders Control', icon: 'fas fa-list-check' },
                  { id: 'services', label: 'Services (API)', icon: 'fas fa-server' },
                  { id: 'notifications', label: 'Broadcast', icon: 'fas fa-bullhorn' },
                  { id: 'links', label: 'Support Links', icon: 'fas fa-link' },
                  { id: 'settings', label: 'Settings', icon: 'fas fa-cog' },
                  { id: 'tasks', label: 'Tasks & Screenshots Proof (টাস্ক প্রুফ)', icon: 'fas fa-tasks' }
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
                    {(Object.entries(paymentMethodsConfig) as [string, { label: string; number: string; icon: string; note?: string; isCrypto?: boolean }][]).map(([key, config]) => {
                      const editState = editingPaymentNumbers[key] || {
                        number: config.number,
                        note: config.note || ''
                      };

                      return (
                        <div
                          key={key}
                          className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg hover:border-white/20 transition"
                        >
                          <div className="flex items-center justify-between pb-2 border-b border-white/5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 font-black text-xs flex items-center justify-center">
                                {config.icon}
                              </div>
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

                            <button
                              type="button"
                              onClick={() => handleSavePaymentNumber(key, editState.number, editState.note)}
                              className="w-full mt-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <i className="fas fa-save"></i>
                              <span>SAVE {config.label.toUpperCase()} NUMBER</span>
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
                <div className="space-y-3">
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
                              <span className="text-[10px] font-mono text-slate-400">
                                {dep.method.toUpperCase()}
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

              {/* SUB TAB 3: ORDERS CONTROL */}
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        {customTasks.map((task) => (
                          <div key={task.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              {task.image ? (
                                <img
                                  src={task.image}
                                  alt={task.title}
                                  onClick={() => setSelectedScreenshotPreview(task.image!)}
                                  className="w-10 h-10 rounded-xl object-cover border border-amber-500/40 cursor-pointer hover:scale-105 transition"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">
                                  <i className={task.icon || 'fas fa-tasks'}></i>
                                </div>
                              )}
                              <div>
                                <h6 className="font-bold text-xs text-white">{task.title}</h6>
                                <span className="text-[10px] text-emerald-400 font-mono font-bold">Reward: ৳{task.reward}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleDeleteAdminTask(task.id)}
                              className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center text-xs transition"
                              title="Delete Task"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
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
                      placeholder="e.g. 8479465879 or @username"
                      value={userTgInputId}
                      onChange={(e) => setUserTgInputId(e.target.value)}
                    />
                    <i className="fab fa-telegram text-sky-400 absolute left-3 top-3 text-xs"></i>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    💡 টেলিগ্রাম থেকে আইডি পেতে <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-amber-400 underline font-bold">@userinfobot</a> বা <a href="https://t.me/RF_SMM_PRO_BOT" target="_blank" rel="noreferrer" className="text-amber-400 underline font-bold">@RF_SMM_PRO_BOT</a> এ মেসেজ দিয়ে আইডি কপি করে নিন।
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
