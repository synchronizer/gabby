const BOT_TOKEN = '8555464304:AAGHs4TvL74kmndkxWQ6jIRzEiu-bj6NlgY';




// ===========================================================
// ===========================================================
// ===========================================================
// ===========================================================
// ===========================================================

const { initializeApp, cert } = require('firebase-admin/app')
const { getDatabase } = require('firebase-admin/database')

const serviceAccount = require('./serviceAccountKey.json')

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: 'https://form-from-543fb-default-rtdb.europe-west1.firebasedatabase.app/'
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

 
    <style>
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
    </style>
    <form class="gabby" data-gabby-id="${formId}">

        <input required type="text" class="gabby__input" data-gabby="Имя" placeholder="Имя">

        <input required type="tel" class="gabby__input" data-gabby="Телефон" placeholder="Телефон">
        <input required type="tel" class="gabby__input" data-gabby="Телефон-2" placeholder="Телефон-2">
        <input required type="tel" class="gabby__input" data-gabby="Телефон-3" placeholder="Телефон-3">

        <textarea class="gabby__input" data-gabby="Комментарий" placeholder="Комментарий"></textarea>

        <button class="gabby__button" type="submit">
            Отправить
        </button>

    </form>

    <script src="gabby.js"></script>

    <script>
        const form = document.querySelector('[data-gabby-id]')
        const button = form.querySelector('button[type="submit"]')

        window.addEventListener('gabby:submit:start', () => {
            button.disabled = true
            button.textContent = 'Отправляем…'
        })

        window.addEventListener('gabby:submit:success', () => {
            button.textContent = 'Отправлено ✓'
        })

        window.addEventListener('gabby:submit:error', () => {
            button.disabled = false
            button.textContent = 'Ошибка. Повторить'
        })
    </script>`
                )
            }

            offset = update.update_id + 1
        }
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
                text
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

fastify.post('/api/submit', async (request, reply) => {

    console.log('--- REQUEST ---')
    console.log('IP:', request.ip)
    console.log('Origin:', request.headers.origin)
    console.log('Referer:', request.headers.referer)
    console.log('User-Agent:', request.headers['user-agent'])
    console.log('----------------')

    const { form_id, data } = request.body

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
        await sendTelegramMessage(
            form.chat_id,
            `🔔 Новая заявка

${Object.entries(data)
                .map(([label, value]) => `${label}: ${value}`)
                .join('\n')}`
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