document.addEventListener('submit', async (event) => {

    const form = event.target

    const formId = form.dataset.gabbyId

    if (!formId) {
        return
    }

    event.preventDefault()

    const data = {}

    form.querySelectorAll('[data-gabby]').forEach((field) => {
        data[field.dataset.gabby] = field.value
    })

    window.dispatchEvent(new CustomEvent('gabby:submit:start'))

    try {

        const response = await fetch(
            'https://gabby-zw4z.onrender.com/api/submit',
            // 'http://localhost:3000/api/submit',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    form_id: formId,
                    data
                })
            }
        )

        const result = await response.json()

        if (!result.success) {
            throw new Error(result.error)
        }

        window.dispatchEvent(
            new CustomEvent('gabby:submit:success')
        )

    } catch (error) {

        window.dispatchEvent(
            new CustomEvent('gabby:submit:error', {
                detail: {
                    error: error.message
                }
            })
        )

    }

})