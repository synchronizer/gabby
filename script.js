const form = document.querySelector('[data-gabby-id]')
        const button = form.querySelector('button[type="submit"]')

        form.addEventListener('gabby:submit:start', () => {
            button.disabled = true
            button.textContent = 'Отправляем…'
        })

        form.addEventListener('gabby:submit:success', () => {
            button.textContent = 'Отправлено ✓'
        })

        form.addEventListener('gabby:submit:error', () => {
            button.disabled = false
            button.textContent = 'Ошибка. Повторить'
        })