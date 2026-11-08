document.addEventListener("DOMContentLoaded", () => {
    const devForm = document.getElementById("developer-form");
    const submitBtn = document.getElementById("dev-submit-btn");
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "Submit";

    function notify(message, type) {
        if (typeof showToast === "function") return showToast(message, type);
        const el = document.createElement("div");
        el.textContent = message;
        el.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] px-5 py-3 rounded-xl text-sm font-semibold shadow-2xl " +
            (type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white");
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    if (!devForm) return;

    devForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const val = id => (document.getElementById(id)?.value || "").trim();
        const payload = {
            name: val("dev-name"),
            email: val("dev-email"),
            whatsapp: val("dev-whatsapp"),
            github: val("dev-github"),
            picture: val("dev-picture"),
            message: val("dev-message")
        };

        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;
        try {
            // The Telegram bot token is kept on the server; the browser never sees it.
            const response = await fetch("/api/developer/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                notify("Application submitted successfully!", "success");
                devForm.reset();
            } else {
                notify(data.error || "Failed to submit application. Please try again later.", "error");
            }
        } catch (error) {
            notify("An error occurred while submitting.", "error");
        } finally {
            submitBtn.innerHTML = originalBtnHtml;
            submitBtn.disabled = false;
        }
    });
});
