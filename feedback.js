document.addEventListener("DOMContentLoaded", () => {
    const feedbackForm = document.getElementById("feedback-form");

    feedbackForm.addEventListener("submit", (e) => {
        e.preventDefault();

        // Extract input forms values
        const name = document.getElementById("f-name").value.trim();
        const type = document.getElementById("f-type").value;
        const message = document.getElementById("f-message").value.trim();

        const targetEmail = "tubejeya@gmail.com";
        const emailSubject = encodeURIComponent(`JTube Feedback: [${type}] from ${name}`);
        
        // Build clear structured string layouts inside email message body formats
        const emailBody = encodeURIComponent(
            `Name: ${name}\n` +
            `Type of Feedback: ${type}\n\n` +
            `Message details:\n${message}\n\n` +
            `--- Sent via JTube Frontend User Support interface ---`
        );

        // Open native user default email software with fields fully prepopulated
        window.location.href = `mailto:${targetEmail}?subject=${emailSubject}&body=${emailBody}`;
    });
});