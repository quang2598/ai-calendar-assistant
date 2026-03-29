(async () => {
  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");
  const spinner = document.getElementById("spinner");

  const results = [];

  // Request microphone
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    results.push("Microphone ✓");
  } catch {
    results.push("Microphone denied");
  }

  // Request geolocation
  try {
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });
    results.push("Location ✓");
  } catch {
    results.push("Location denied");
  }

  spinner.style.display = "none";

  const allGranted = results.every((r) => r.includes("✓"));
  if (allGranted) {
    title.textContent = "All Permissions Granted";
    title.classList.add("success");
    subtitle.textContent = results.join("  •  ") + "\n\nThis window will close automatically...";
    chrome.runtime.sendMessage({ action: "micPermissionGranted" });
    setTimeout(() => window.close(), 2000);
  } else {
    title.textContent = "Permissions";
    subtitle.textContent = results.join("  •  ") + "\n\nFor denied permissions, click the icon in the address bar to allow, then refresh this page.";
  }
})();
