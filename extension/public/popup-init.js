// Fast sync check — hide auth screen if already signed in, before module loads
chrome.storage.local.get(["authToken", "userInfo"], function (s) {
  if (s.authToken && s.userInfo) {
    document.getElementById("auth-screen").classList.add("hidden");
    document.getElementById("chat-screen").classList.remove("hidden");
  }
});
