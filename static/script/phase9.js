const socket = io();
const room = "{{ room }}";
const username = "{{ username }}";

// Typing indicator
let typing = false;
let timeout = undefined;

document.getElementById("message").addEventListener("input", () => {
    if (!typing) {
        typing = true;
        socket.emit("typing", { username, room });
        timeout = setTimeout(stopTyping, 2000);
    } else {
        clearTimeout(timeout);
        timeout = setTimeout(stopTyping, 2000);
    }
});

function stopTyping() {
    typing = false;
    socket.emit("stop_typing", { room });
}

socket.on("show_typing", (data) => {
    document.getElementById("typing").innerText = `${data.username} is typing...`;
});

socket.on("hide_typing", () => {
    document.getElementById("typing").innerText = "";
});