# Discord setup — Kyle's part (the only steps I can't do)

I can build everything else, but I cannot create accounts, log into Discord, or handle the secret tokens. These steps are yours. ~15 minutes. When you're done, give me the 5 values at the bottom and I take it from there.

---

## Step 1 — Discord account
- If you already have one, use it. If not, go to **discord.com** and create one (free).

## Step 2 — Create a private server
- In the Discord app, click the **+** on the left rail → **Create My Own** → name it anything (e.g. "Dawn Trader HQ").
- Inside it, you'll have a default text channel (e.g. **#general**). That one channel is all we need — it replaces "topic 21." You can rename it to **#batch-implementation** if you like.

## Step 3 — Get your own user ID (so the bots know which human is you)
- User Settings (gear, bottom-left) → **Advanced** → turn ON **Developer Mode**.
- Right-click your own name in the member list → **Copy User ID**. Save that number.

## Step 4 — Create TWO bot applications
Go to **discord.com/developers/applications** (logged in as the same account). Do this **twice** — once per bot:

**Bot A — "DawnTrader CC"** (this is my voice; replaces @CCDTCommsBot)
1. **New Application** → name it `DawnTrader CC` → Create.
2. Left menu → **Bot**.
3. Under **Privileged Gateway Intents**, turn ON **MESSAGE CONTENT INTENT** (this is the load-bearing one — it's what lets the bots read each other). You can also turn on Server Members + Presence; not required.
4. Click **Reset Token** → **Copy** the token. Save it labeled "CC token." (Treat it like a password — anyone with it can post as the bot.)

**Bot B — "Langston"** (replaces @LangstonDTBot)
- Repeat 1–4 exactly, naming it `Langston`. Save its token labeled "Langston token."

## Step 5 — Invite both bots into your server
For **each** of the two applications:
1. Left menu → **OAuth2** → **URL Generator**.
2. Under **Scopes**, check **bot**.
3. Under **Bot Permissions**, check: **Send Messages**, **Read Message History**, **Attach Files**, **Embed Links**.
4. Copy the generated URL at the bottom, paste it in your browser, pick your server, **Authorize**.
- Do this for both bots. When done you'll see both "DawnTrader CC" and "Langston" in the server's member list.

## Step 6 — Get the server ID and channel ID
- With Developer Mode on (Step 3): right-click your **server icon** → **Copy Server ID**.
- Right-click the **channel** (#general or whatever you named it) → **Copy Channel ID**.

---

## Hand me these 5 values
1. **CC bot token**
2. **Langston bot token**
3. **Server (guild) ID**
4. **Channel ID**
5. **Your Discord user ID**

For the two tokens (they're secrets): easiest + safest is you paste them into two files on the server yourself, and I'll tell you the exact two one-line commands to do that when you're ready — that way I never handle the raw token. Or, if you'd rather just send them to me, I'll place them. Your call.

Once I have these, I deploy the two new bots alongside the Telegram ones (Telegram stays 100% untouched and running), and we run the live tests.
