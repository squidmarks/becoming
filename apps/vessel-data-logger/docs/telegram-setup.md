# Telegram Notifications Setup

This guide walks you through setting up Telegram bot notifications for the Vessel Data Logger.

## Step 1: Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Start a chat and send `/newbot`
3. Follow the prompts:
   - Choose a name for your bot (e.g., "Becoming Vessel Monitor")
   - Choose a username (must end in "bot", e.g., "becoming_vessel_bot")
4. BotFather will provide you with a **bot token** that looks like:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
5. **Save this token** - you'll need it for configuration

## Step 2: Get Your Chat ID

You need to find the Chat ID where the bot should send messages.

### Option A: Direct Message (Personal Notifications)

1. Click the link BotFather provided to start a chat with your bot
2. Send any message to your bot (e.g., "hello")
3. Open this URL in your browser (replace `<YOUR_BOT_TOKEN>` with your actual token):
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
4. Look for the `"chat"` object in the JSON response:
   ```json
   {
     "chat": {
       "id": 123456789,
       "first_name": "Your Name",
       "type": "private"
     }
   }
   ```
5. The `id` value (e.g., `123456789`) is your **Chat ID**

### Option B: Group Chat (Shared Notifications)

1. Create a new Telegram group
2. Add your bot to the group (search for the bot username)
3. Send a message in the group
4. Visit the same URL as above:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
5. Look for the group chat ID (will be negative, like `-987654321`)

## Step 3: Configure the Data Logger

On your Raspberry Pi (or wherever the logger runs):

1. Edit the `.env` file:
   ```bash
   cd ~/becoming/apps/vessel-data-logger
   nano .env
   ```

2. Add your Telegram credentials:
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=123456789
   ```

3. Save and exit (Ctrl+X, Y, Enter)

4. Restart the service:
   ```bash
   sudo systemctl restart vessel-data-logger
   ```

## Step 4: Test the Configuration

You can test that notifications are working by:

1. Creating an event detector with notifications enabled (in `config.json`):
   ```json
   {
     "detectorId": "test_notification",
     "name": "Test Event",
     "description": "Testing notification system",
     "type": "duration",
     "notifications": {
       "enabled": true
     },
     "startConditions": {
       "operator": "AND",
       "rules": [
         { "path": "navigation.speedOverGround", "operator": ">", "value": 0 }
       ]
     },
     "endConditions": {
       "operator": "AND",
       "rules": [
         { "path": "navigation.speedOverGround", "operator": "<=", "value": 0 }
       ]
     }
   }
   ```

2. Or using the test API endpoint (future feature):
   ```bash
   curl http://localhost:3200/api/notifications/test
   ```

## Notification Format

Telegram notifications include:

- **Title**: Event name with emoji (based on priority)
- **Message**: Event description
- **Details**: Key data captured at event start/end
- **Timestamp**: When the event occurred

### Priority Emojis

- ℹ️ Low priority
- 🔔 Normal priority
- ⚠️ High priority
- 🚨 Urgent priority

### Example Notification

```
🔔 Vessel Underway Started

Vessel motion detected - underway

Details:
• Speed Over Ground: 4.50 kts
• Course Over Ground: 135.2°
• Position: 32.785724, -79.909782
• Event Id: vessel_underway_20260408_145623

4/8/26, 2:56 PM
```

## Troubleshooting

### Bot Not Sending Messages

1. Check the service logs:
   ```bash
   sudo journalctl -u vessel-data-logger -f
   ```

2. Look for errors like:
   - `⚠️ Telegram transport: Missing botToken or chatId`
   - `❌ Telegram notification failed`

3. Verify your credentials are correct in `.env`

4. Make sure you've sent at least one message to your bot first

### Can't Find Chat ID

If the `getUpdates` URL returns an empty result:
- Make sure you've sent a message to your bot
- Try sending another message and refreshing the URL
- For groups, make sure the bot is added as a member

### Group Notifications Not Working

- Ensure the bot has permission to read messages in the group
- The chat ID for groups is always negative (e.g., `-123456`)
- Make sure you haven't accidentally used the bot's ID instead of the chat ID

## Privacy & Security

- The bot token is like a password - keep it secret
- Don't commit `.env` files to git
- If your token is compromised, use BotFather's `/revoke` command to get a new one
- Only add the bot to groups where you want notifications

## Advanced: Multiple Recipients

To send notifications to multiple people/groups:

1. Create multiple bots (or use one bot in multiple groups)
2. In the future, we can add support for multiple chat IDs in the configuration

## Further Reading

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#6-botfather)
