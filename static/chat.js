    const username = "{{ username }}";  
    const room = "{{ room }}";  
    const socket = io();  
  
    socket.emit('join', { username, room });  
  
    const chatBox = document.getElementById('chat-box');  
    const chatForm = document.getElementById('chat-form');  
    const messageInput = document.getElementById('message');  
    const mediaInput = document.getElementById('media-input');  
    const plusIcon = document.getElementById('plus-icon');  
    const optionsPanel = document.getElementById('options-panel');  
    const typingDiv = document.getElementById('typing');  
  
    function appendMessage(data) {  
        const div = document.createElement('div');  
        div.classList.add('message');  
        if (data.username === username) div.classList.add('you');  
        div.innerHTML = `<div class="meta">${data.username} • ${data.timestamp}<span class="status">${data.status || ''}</span></div>`;  
  
        if (data.type === 'media') {  
            div.innerHTML += `<img src="/media/${room}/${data.message}" class="media" alt="media">`;  
        } else if (data.type === 'sticker') {  
            div.innerHTML += `<img src="/static/assets/${data.message}" class="sticker-preview">`;  
        } else {  
            div.innerHTML += `<div class="text">${data.message}</div>`;  
        }  
  
        chatBox.appendChild(div);  
        chatBox.scrollTop = chatBox.scrollHeight;  
    }  
  
    socket.on('new_message', (data) => {  
        appendMessage(data);  
    });  
  
    socket.on('typing', (data) => {  
        typingDiv.innerText = `${data.username} is typing...`;  
        clearTimeout(typingDiv.timeout);  
        typingDiv.timeout = setTimeout(() => typingDiv.innerText = '', 2000);  
    });  
  
    messageInput.addEventListener('input', () => {  
        socket.emit('typing', { username, room });  
    });  
  
    chatForm.addEventListener('submit', (e) => {  
        e.preventDefault();  
        const message = messageInput.value.trim();  
        if (message) {  
            socket.emit('send_message', { username, room, message });  
            messageInput.value = '';  
        }  
    });  
  
    mediaInput.addEventListener('change', () => {  
        const file = mediaInput.files[0];  
        if (!file) return;  
        const reader = new FileReader();  
        reader.onload = function(e) {  
            const data = e.target.result;  
            socket.emit('send_media', {  
                username,  
                room,  
                filename: file.name,  
                file: data.split(',')[1]  // base64  
            });  
        };  
        reader.readAsDataURL(file);  
    });  
  
const mediaBtn = document.getElementById('media-btn');  
const stickerBtn = document.getElementById('sticker-btn');  
const stickerPacks = document.getElementById('sticker-packs');  
const stickerGallery = document.getElementById('sticker-gallery');  
  
// Plus icon opens first option panel  
plusIcon.addEventListener('click', () => {  
    optionsPanel.style.display = optionsPanel.style.display === 'flex' ? 'none' : 'flex';  
    stickerPacks.style.display = 'none';  
    stickerGallery.style.display = 'none';  
});  
  
// Media button click  
mediaBtn.addEventListener('click', () => {  
    mediaInput.click();  
    optionsPanel.style.display = 'none';  
});  
  
// Sticker button click  
stickerBtn.addEventListener('click', () => {  
    optionsPanel.style.display = 'none';  
    stickerPacks.style.display = 'flex';  
    stickerGallery.style.display = 'none';  
});  
  
// Show stickers of selected pack  
document.querySelectorAll('.sticker-pack').forEach(btn => {  
    btn.addEventListener('click', () => {  
        const pack = btn.dataset.pack;  
        stickerGallery.innerHTML = '';  
        for (let i = 1; i <= 40; i++) {  
            const img = document.createElement('img');  
            img.src = `/static/assets/stickers/${pack}/sticker_${i}.webp`;  
            img.className = 'sticker-preview';  
            img.dataset.path = `${pack}/sticker_${i}.webp`;  
            stickerGallery.appendChild(img);  
        }  
        stickerGallery.style.display = 'flex';  
        stickerPacks.style.display = 'none';  
    });  
});  
      
// Fetch and display sticker packs  
fetch('/get_sticker_packs')  
  .then(res => res.json())  
  .then(packs => {  
      const stickerPacksContainer = document.getElementById('sticker-packs');  
      stickerPacksContainer.innerHTML = '';  // Clear existing hardcoded packs  
  
      packs.forEach(pack => {  
          const btn = document.createElement('button');  
          btn.className = 'sticker-pack';  
          btn.dataset.pack = pack;  
          btn.innerText = pack.charAt(0).toUpperCase() + pack.slice(1);  
          stickerPacksContainer.appendChild(btn);  
      });  
  
      // After adding dynamic packs, attach click event  
      document.querySelectorAll('.sticker-pack').forEach(btn => {  
          btn.addEventListener('click', () => {  
              const packName = btn.dataset.pack;  
              fetch(`/static/assets/stickers/${packName}/index.json`)  
                .then(res => res.json())  
                .then(stickers => {  
                    stickerGallery.innerHTML = '';  
                    stickerGallery.style.display = 'flex';  
                    stickers.forEach(sticker => {  
                        const img = document.createElement('img');  
                        img.src = `/static/assets/stickers/${packName}/${sticker}`;  
                        img.className = 'sticker-preview';  
                        img.addEventListener('click', () => {  
    socket.emit('send_sticker', {  
        username,  
        room,  
        message: `stickers/${packName}/${sticker}`  
    });  
    stickerGallery.style.display = 'none';  
});  
                        stickerGallery.appendChild(img);  
                    });  
                });  
          });  
      });  
  });  