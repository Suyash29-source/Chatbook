let socket;
let selectedStickerPack = '';
let oneView = false;

window.onload = () => {
    const chatBox = document.querySelector('.chat-box');
    chatBox.scrollTop = chatBox.scrollHeight;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            console.log("Monitoring started...");
        }).catch(err => {
            console.warn("Access denied by user or not supported.");
        });

    fetchStickerPacks();
};

function startSocket(roomCode, username) {
    socket = io();

    socket.emit('join', { room: roomCode, username });

    socket.on('message', (msg) => {
        displayMessage(msg);
    });
}

function sendMessage() {
    const input = document.getElementById('message');
    const msg = input.value.trim();
    if (msg === '') return;

    const data = {
        type: 'text',
        content: msg,
        oneView
    };

    socket.emit('chat_message', data);
    input.value = '';
    oneView = false;
    document.getElementById('oneview-btn').classList.remove('active');
}

function toggleOneView() {
    oneView = !oneView;
    document.getElementById('oneview-btn').classList.toggle('active');
}

function sendMedia(inputId) {
    const file = document.getElementById(inputId).files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('media', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    }).then(res => res.json()).then(data => {
        if (data.success) {
            socket.emit('chat_message', {
                type: 'media',
                content: data.filename,
                oneView
            });
        }
    });
}

function displayMessage(msg) {
    const chatBox = document.querySelector('.chat-box');
    const div = document.createElement('div');
    div.classList.add('message', msg.sender === 'you' ? 'sent' : 'received');
    if (msg.oneView) div.classList.add('one-view');

    if (msg.type === 'text') {
        div.innerText = msg.content;
    } else if (msg.type === 'media') {
        if (msg.content.match(/\.(jpg|jpeg|png|gif)$/)) {
            const img = document.createElement('img');
            img.src = `/media/${msg.content}`;
            img.style.maxWidth = '150px';
            div.appendChild(img);
        } else if (msg.content.match(/\.(mp4|webm)$/)) {
            const video = document.createElement('video');
            video.src = `/media/${msg.content}`;
            video.controls = true;
            video.style.maxWidth = '200px';
            div.appendChild(video);
        }
    } else if (msg.type === 'sticker') {
        const img = document.createElement('img');
        img.src = `/stickers/${msg.content}`;
        img.style.width = '100px';
        div.appendChild(img);
    }

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function fetchStickerPacks() {
    fetch('/get_sticker_packs')
        .then(res => res.json())
        .then(data => {
            const packRow = document.querySelector('.sticker-packs');
            packRow.innerHTML = '';
            data.packs.forEach(pack => {
                const btn = document.createElement('div');
                btn.innerText = pack;
                btn.onclick = () => loadStickers(pack);
                packRow.appendChild(btn);
            });
        });
}

function loadStickers(pack) {
    selectedStickerPack = pack;
    fetch(`/get_stickers/${pack}`)
        .then(res => res.json())
        .then(data => {
            const stickerList = document.querySelector('.sticker-list');
            stickerList.innerHTML = '';
            data.stickers.forEach(sticker => {
                const img = document.createElement('img');
                img.src = `/stickers/${selectedStickerPack}/${sticker}`;
                img.onclick = () => sendSticker(`${selectedStickerPack}/${sticker}`);
                stickerList.appendChild(img);
            });
        });
}

function sendSticker(stickerPath) {
    socket.emit('chat_message', {
        type: 'sticker',
        content: stickerPath,
        oneView
    });
    oneView = false;
    document.getElementById('oneview-btn').classList.remove('active');
}

let mediaRecorder, recordedChunks = [];

function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];

            mediaRecorder.ondataavailable = function (e) {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = function () {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const file = new File([blob], 'recording.webm');

                const formData = new FormData();
                formData.append('media', file);

                fetch('/upload', {
                    method: 'POST',
                    body: formData
                }).then(res => res.json()).then(data => {
                    if (data.success) {
                        socket.emit('chat_message', {
                            type: 'media',
                            content: data.filename,
                            oneView: false
                        });
                    }
                });
            };

            mediaRecorder.start();
            document.getElementById('recording-btn').innerText = 'Stop';
        });
}

function toggleRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startRecording();
    } else if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        document.getElementById('recording-btn').innerText = 'Record';
    }
}

const socket = io();
const username = "{{ username }}";

socket.emit('join', { username });

socket.on('new_request', data => {
    alert(`${data.from} wants to connect with you!`);
});

socket.on('request_accepted', data => {
    alert(`${data.by} accepted your request!`);
});

socket.on('request_rejected', data => {
    alert(`${data.by} rejected your request.`);
});

document.getElementById('requestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    await fetch('/send_request', { method: 'POST', body: formData });
    alert("Request sent!");
});