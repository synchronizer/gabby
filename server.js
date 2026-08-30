const BOT_TOKEN = process.env.BOT_TOKEN




// ===========================================================
// ===========================================================
// ===========================================================
// ===========================================================
// ===========================================================

const { initializeApp, cert } = require('firebase-admin/app')
const { getDatabase } = require('firebase-admin/database')
const crypto = require('crypto')

const serviceAccount = require('./serviceAccountKey.json')

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
})

const db = getDatabase()

function generateFormId() {
    return 'ff_' + Math.random().toString(36).substring(2, 10)
}


// =======================================
// Telegram
// =======================================

let offset = 0

async function getTelegramUpdates() {
    try {
        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}`
        )

        const result = await response.json()

        console.log(result)

        if (result.ok && result.result.length > 0) {
            for (const update of result.result) {
                const message = update.message

                if (message?.text === '/form') {

                    const formsSnapshot = await db
                        .ref('forms')
                        .orderByChild('chat_id')
                        .equalTo(message.chat.id)
                        .once('value')

                    const forms = formsSnapshot.val()

                    let formId

                    if (forms) {
                        formId = Object.keys(forms)[0]

                        console.log('Форма уже существует:', formId)
                        console.log('Chat ID:', message.chat.id)

                    } else {

                        formId = generateFormId()

                        await db.ref(`forms/${formId}`).set({
                            chat_id: message.chat.id,
                            enabled: true,
                            origins: {},
                            created_at: Date.now()
                        })

                        console.log('Форма создана:', formId)
                        console.log('Chat ID:', message.chat.id)
                    }

                    await sendTelegramMessage(
                        message.chat.id,
                        `Готово! Форма создана.

Вставьте этот код на свой сайт:

<pre><code>&lt;style&gt;
    .gabby {
        width: min(20rem, 100%);
        padding: 1.5rem;
        border-radius: 1rem;
        display: grid;
        gap: 1rem;
        box-shadow: 0 0 0 2px canvasText;
        background-color: canvas;
    }

    .gabby__input,
    .gabby__button {
        box-shadow: 0 0 0 2px canvasText;
        background-color: canvas;
        border-radius: .5rem;
        height: 3rem;
        border: none;
        padding-inline: 1rem;
        padding-block: .5rem;
        box-sizing: border-box;
        resize: vertical;
    }

    .gabby__button {
        box-shadow: none;
        background-color: canvastext;
        color: canvas;
        font-size: 1rem;
        font-family: monospace;
    }
&lt;/style&gt;

&lt;form
    class="gabby"
    data-gabby-id="${formId}"&gt;

    &lt;input
        required
        type="text"
        class="gabby__input"
        data-gabby="Имя"
        placeholder="Имя"&gt;

    &lt;input
        required
        type="tel"
        class="gabby__input"
        data-gabby="Телефон"
        placeholder="Телефон"&gt;

    &lt;textarea
        class="gabby__input"
        data-gabby="Комментарий"
        placeholder="Комментарий"
    &gt;&lt;/textarea&gt;

    &lt;button
        class="gabby__button"
        type="submit"&gt;
        Отправить
    &lt;/button&gt;

&lt;/form&gt;

&lt;script src="gabby.js"&gt;&lt;/script&gt;

&lt;script&gt;
    const form = document.querySelector('[data-gabby-id]')
    const button = form.querySelector('button[type="submit"]')

    window.addEventListener('gabby:submit:start', () =&gt; {
        button.disabled = true
        button.textContent = 'Отправляем…'
    })

    window.addEventListener('gabby:submit:success', () =&gt; {
        button.textContent = 'Отправлено ✓'
    })

    window.addEventListener('gabby:submit:error', () =&gt; {
        button.disabled = false
        button.textContent = 'Ошибка. Повторить'
    })
&lt;/script&gt;</code></pre>`
                    )
                }

                offset = update.update_id + 1
            }
        }

    } catch (error) {
        console.error('Telegram polling error:', error)
    }

    setTimeout(getTelegramUpdates, 1000)
}

getTelegramUpdates()




async function sendTelegramMessage(chatId, text) {
    const response = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'HTML'
            })
        }
    )

    const result = await response.json()

    if (!result.ok) {
        throw new Error(result.description)
    }

    return result
}



// =======================================
// Server
// =======================================

const fastify = require('fastify')({
    logger: true
})

fastify.register(require('@fastify/cors'), {
    origin: true
})

fastify.get('/', async () => {
    return {
        status: 'ok',
        service: 'Gabby'
    }
})


// =======================================
// Protection: Rate Limit
// =======================================

const rateLimits = new Map()

const RATE_LIMIT = 3
const RATE_WINDOW = 60 * 1000

function protectionRateLimit(formId, ip) {

    const key = `${formId}:${ip}`
    const now = Date.now()

    const timestamps = rateLimits.get(key) || []

    const recent = timestamps.filter(
        timestamp => now - timestamp < RATE_WINDOW
    )

    if (recent.length >= RATE_LIMIT) {
        rateLimits.set(key, recent)

        return false
    }

    recent.push(now)

    rateLimits.set(key, recent)

    return true
}


// =======================================
// Protection: Honeypot
// =======================================

function protectionHoneypot(data) {

    return !data.gabby_extra
}

// =======================================
// Protection: Token
// =======================================

const tokens = new Map()

const TOKEN_LIFETIME = 30 * 1000


function createToken(formId) {

    const token = crypto.randomUUID()

    tokens.set(token, {
        formId,
        expiresAt: Date.now() + TOKEN_LIFETIME
    })

    return token
}

function protectionToken(formId, token) {

    const record = tokens.get(token)

    if (!record) {
        return false
    }

    if (record.formId !== formId) {
        return false
    }

    if (Date.now() > record.expiresAt) {
        tokens.delete(token)
        return false
    }

    tokens.delete(token)

    return true
}

fastify.post('/api/prepare', async (request, reply) => {

    const { form_id } = request.body

    const snapshot = await db
        .ref(`forms/${form_id}`)
        .once('value')

    const form = snapshot.val()

    if (!form) {
        return reply.code(404).send({
            success: false,
            error: 'FORM_NOT_FOUND'
        })
    }

    const token = createToken(form_id)

    return {
        success: true,
        token
    }
})


// =======================================
// Submit
// =======================================

fastify.post('/api/submit', async (request, reply) => {

    const clientIp =
        request.headers['cf-connecting-ip'] || 'unknown'

    const { form_id, token, data } = request.body

    console.log('Client IP:', clientIp)

    if (!protectionHoneypot(data)) {
        return reply.code(400).send({
            success: false,
            error: 'HONEYPOT'
        })
    }

    if (!protectionRateLimit(form_id, clientIp)) {
        return reply.code(429).send({
            success: false,
            error: 'RATE_LIMIT'
        })
    }

    if (!protectionToken(form_id, token)) {
        return reply.code(403).send({
            success: false,
            error: 'INVALID_TOKEN'
        })
    }

    console.log('========== GABBY REQUEST 2 ==========')

    console.log('IP:', request.ip)

    console.log('Origin:', request.headers.origin)

    console.log('Referer:', request.headers.referer)

    console.log('User-Agent:', request.headers['user-agent'])

    console.log('Content-Type:', request.headers['content-type'])

    console.log('Host:', request.headers.host)

    console.log('Body:', JSON.stringify(request.body, null, 2))

    console.log('====================================')

    console.log('X-Forwarded-For:', request.headers['x-forwarded-for'])

    console.log('X-Real-IP:', request.headers['x-real-ip'])

    console.log('CF-Connecting-IP:', request.headers['cf-connecting-ip'])

    console.log('====================================')

    const snapshot = await db
        .ref(`forms/${form_id}`)
        .once('value')

    const form = snapshot.val()

    if (!form) {
        return reply.code(404).send({
            success: false,
            error: 'FORM_NOT_FOUND'
        })
    }

    try {

        const origin = request.headers.origin || 'неизвестный сайт'

        await sendTelegramMessage(
            form.chat_id,
            `<pre><code class="language-html"><b>Новая заявка</b>

${Object.entries(data)
                .map(([label, value]) => `${label}: ${value}`)
                .join('\n\n')}

Источник: ${origin}</code></pre>`
        )

        return {
            success: true
        }

    } catch (error) {

        request.log.error(error)

        return reply.code(500).send({
            success: false,
            error: 'DELIVERY_FAILED'
        })
    }
})


fastify.listen({
    port: process.env.PORT || 3000,
    host: '0.0.0.0'
})