console.log('GABBY LOADED')

const apiUrl =
    'https://gabby-test.synchronizer.workers.dev'


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


    // =======================================
    // Submit start
    // =======================================

    form.dispatchEvent(
        new CustomEvent('gabby:submit:start', {
            bubbles: true
        })
    )


    try {

        // =======================================
        // Prepare
        // =======================================

        const prepareResponse = await fetch(
            `${apiUrl}/api/prepare`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    form_id: formId
                })
            }
        )

        const prepareResult = await prepareResponse.json()

        if (!prepareResult.success) {
            throw new Error(prepareResult.error)
        }


        // =======================================
        // Submit
        // =======================================

        const response = await fetch(
            `${apiUrl}/api/submit`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    form_id: formId,
                    token: prepareResult.token,
                    data
                })
            }
        )

        const result = await response.json()

        if (!result.success) {
            throw new Error(result.error)
        }


        // =======================================
        // Submit success
        // =======================================

        form.dispatchEvent(
            new CustomEvent('gabby:submit:success', {
                bubbles: true
            })
        )


    } catch (error) {


        // =======================================
        // Submit error
        // =======================================

        form.dispatchEvent(
            new CustomEvent(
                'gabby:submit:error',
                {
                    bubbles: true,
                    detail: {
                        error: error.message
                    }
                }
            )
        )

    }

})