document.addEventListener("DOMContentLoaded", () => {
    const devForm = document.getElementById("developer-form");
    const submitBtn = document.getElementById("dev-submit-btn");

    devForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("dev-name").value;
        const email = document.getElementById("dev-email").value;
        const whatsapp = document.getElementById("dev-whatsapp").value;
        const github = document.getElementById("dev-github").value;
        const picture = document.getElementById("dev-picture").value;
        const message = document.getElementById("dev-message").value;

        // Construct the message for Telegram
        const textMessage = `
🚀 *New Developer Application* 🚀
*Name:* ${name}
*Email:* ${email}
*WhatsApp:* ${whatsapp}
*GitHub:* ${github}
${picture ? `*Picture URL:* ${picture}\n` : ''}
*Message:* ${message ? message : 'N/A'}
        `.trim();

        // Get credentials from env.js
        const botToken = typeof ENV !== 'undefined' ? ENV.TELEGRAM_BOT_TOKEN : null;
        const chatId = typeof ENV !== 'undefined' ? ENV.TELEGRAM_CHAT_ID : null;

        if (!botToken || !chatId) {
            showToast("Telegram configuration is missing in env.js!", "error");
            return;
        }

        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

        try {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: textMessage,
                    parse_mode: "Markdown"
                })
            });

            if (response.ok) {
                showToast("Application submitted successfully!", "success");
                devForm.reset();
            } else {
                console.error("Telegram API Error:", await response.text());
                showToast("Failed to submit application. Please try again later.", "error");
            }
        } catch (error) {
            console.error("Network Error:", error);
            showToast("An error occurred while submitting.", "error");
        } finally {
            submitBtn.innerHTML = '<i class="fab fa-telegram-plane"></i> Submit Application';
            submitBtn.disabled = false;
        }
    });
});
