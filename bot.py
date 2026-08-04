import os
import sys
import time
import requests

# ======================================================
# RF SMM TELEGRAM BOT CONFIGURATION
# ======================================================
BOT_TOKEN = os.environ.get("BOT_TOKEN", "8417495766:AAEupqJEr6_IyvOcGXhhdWStj95khUdr8MU")
CHANNEL_1_ID = os.environ.get("CHANNEL_1_ID", os.environ.get("CHANNEL_ID", "-1003911086814"))
CHANNEL_1_URL = os.environ.get("CHANNEL_1_URL", os.environ.get("CHANNEL_URL", "https://t.me/RF2_SMM"))
CHANNEL_2_ID = os.environ.get("CHANNEL_2_ID", "")
CHANNEL_2_URL = os.environ.get("CHANNEL_2_URL", "")
MINI_APP_URL = os.environ.get("MINI_APP_URL", "https://t.me/RF_SMM_PRO_BOT?startapp=8479465879")

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

def send_telegram_request(method, payload):
    """Utility to send request to Telegram Bot API"""
    try:
        response = requests.post(f"{TELEGRAM_API_URL}/{method}", json=payload, timeout=10)
        return response.json()
    except Exception as e:
        print(f"❌ Telegram API Error ({method}): {e}")
        return None

def send_message(chat_id, text, reply_markup=None):
    """Send HTML formatted message to user or channel"""
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    return send_telegram_request("sendMessage", payload)

def post_live_order_to_channel(order_data):
    """
    Post live order notification to official channel(s).
    order_data keys: order_id, user_name, service_name, quantity, cost, link, status, api_order_id
    """
    order_id = order_data.get("order_id", "1001")
    user_name = order_data.get("user_name", "Customer")
    service_name = order_data.get("service_name", "SMM Service")
    quantity = order_data.get("quantity", 1000)
    cost = order_data.get("cost", 0.0)
    link = order_data.get("link", "#")
    status = order_data.get("status", "Processing")
    api_order_id = order_data.get("api_order_id", "")

    text = (
        f"🛍️ <b>NEW LIVE ORDER PLACED!</b>\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"🆔 <b>Order ID:</b> <code>#{str(order_id)[-6:].upper()}</code>\n"
    )
    if api_order_id:
        text += f"⚡ <b>API Order ID:</b> <code>{api_order_id}</code>\n"

    text += (
        f"👤 <b>Customer:</b> {user_name}\n"
        f"📦 <b>Service:</b> {service_name}\n"
        f"🔢 <b>Quantity:</b> {quantity:,}\n"
        f"💰 <b>Cost:</b> ৳ {cost:.2f}\n"
        f"📌 <b>Status:</b> {status}\n"
        f"🔗 <b>Target Link:</b>\n<code>{link}</code>\n"
        f"━━━━━━━━━━━━━━━━━━━\n"
        f"🚀 <i>Fastest SMM Panel Service in Bangladesh! Order via Bot or Mini App below:</i>"
    )

    buttons = [
        {"text": "🚀 Open Mini App", "url": MINI_APP_URL},
        {"text": "📢 Channel 1", "url": CHANNEL_1_URL}
    ]
    if CHANNEL_2_URL:
        buttons.append({"text": "📢 Channel 2", "url": CHANNEL_2_URL})

    keyboard = {"inline_keyboard": [buttons]}

    # Send to Channel 1
    res1 = send_message(CHANNEL_1_ID, text, keyboard) if CHANNEL_1_ID else None

    # Send to Channel 2 if configured
    res2 = send_message(CHANNEL_2_ID, text, keyboard) if CHANNEL_2_ID else None

    return res1 or res2

def handle_start(chat_id, first_name):
    """Handle /start command from Telegram users"""
    welcome_msg = (
        f"👋 <b>Welcome {first_name} to RF SMM PRO!</b>\n\n"
        f"🔥 <b>Bangladesh's #1 Social Media Marketing Panel</b>\n"
        f"Boost your Facebook, YouTube, TikTok, Instagram & Telegram accounts instantly!\n\n"
        f"✨ <i>Features:</i>\n"
        f"• Instant Automatic Order Processing\n"
        f"• bKash, Nagad & Rocket Automatic Deposit\n"
        f"• 24/7 Support & Fast Refill Guarantee\n\n"
        f"👇 Click the button below to launch the <b>RF SMM Mini App</b>:"
    )

    keyboard = {
        "inline_keyboard": [
            [
                {"text": "🚀 Launch RF SMM Mini App", "url": MINI_APP_URL}
            ],
            [
                {"text": "📢 Farju Tech Studio", "url": "https://t.me/Farju_Tech_Studio"},
                {"text": "📢 Rashal Tech World", "url": "https://t.me/RashalTechWorld"}
            ],
            [
                {"text": "📢 RF2 SMM Official", "url": "https://t.me/RF2_SMM"},
                {"text": "📢 Farju SMM Panel", "url": "https://t.me/FARJU_SMM_PANAL"}
            ]
        ]
    }

    send_message(chat_id, welcome_msg, keyboard)

def start_bot_polling():
    """Start Long Polling to listen for messages and /start commands"""
    print(f"🤖 RF SMM Telegram Bot is running...")
    print(f"📌 Token: {BOT_TOKEN[:10]}... | Channel: {CHANNEL_ID}")
    
    offset = 0
    while True:
        try:
            res = requests.get(f"{TELEGRAM_API_URL}/getUpdates", params={"offset": offset, "timeout": 20}, timeout=25)
            if res.status_code == 200:
                data = res.json()
                if data.get("ok"):
                    for update in data.get("result", []):
                        offset = update["update_id"] + 1
                        message = update.get("message", {})
                        if not message:
                            continue

                        chat_id = message.get("chat", {}).get("id")
                        text = message.get("text", "")
                        first_name = message.get("from", {}).get("first_name", "User")

                        if text and text.startswith("/start"):
                            handle_start(chat_id, first_name)
                        elif text and text.startswith("/test_order"):
                            # Send a test notification to the channel
                            res_test = post_live_order_to_channel({
                                "order_id": "TEST849201",
                                "user_name": first_name,
                                "service_name": "Facebook Page Likes & Followers (Real & Refill)",
                                "quantity": 1000,
                                "cost": 150.0,
                                "link": "https://t.me/RF2_SMM",
                                "status": "Processing",
                                "api_order_id": 849201
                            })
                            send_message(chat_id, "✅ Test order sent to channel!")

        except KeyboardInterrupt:
            print("\n👋 Bot stopped by user.")
            sys.exit(0)
        except Exception as e:
            print(f"⚠️ Polling Exception: {e}")
            time.sleep(3)

if __name__ == "__main__":
    start_bot_polling()
