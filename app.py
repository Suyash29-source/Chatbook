from flask import Flask, render_template, request, redirect, url_for, session, flash, send_from_directory
from werkzeug.utils import secure_filename
import os, json, datetime, uuid
from flask_socketio import SocketIO, join_room, leave_room, emit, disconnect
import hashlib
from datetime import datetime
from flask import jsonify
import eventlet
eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
socketio = SocketIO(app, async_mode='eventlet')
UPLOAD_FOLDER = 'media'
USER_DATA_FOLDER = 'user_data'
STICKERS_FOLDER = 'static/stickers'
UPLOAD_FOLDER = 'chat_history'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
user_connections = {}  # socket_id -> {'username': ..., 'room': ...}


PENDING_REQUESTS_FILE = 'pending_requests.json'
PAIRINGS_FILE = 'pairings.json'

def load_json(file):
    if not os.path.exists(file):
        with open(file, 'w') as f:
            json.dump({}, f)
    with open(file, 'r') as f:
        return json.load(f)

def save_json(file, data):
    with open(file, 'w') as f:
        json.dump(data, f, indent=4)

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(USER_DATA_FOLDER, exist_ok=True)

def get_date():
    return datetime.datetime.now().strftime('%Y-%m-%d')

def get_time():
    return datetime.datetime.now().strftime('%H:%M:%S')

def get_user_file(username):
    return os.path.join(USER_DATA_FOLDER, username, 'info.json')

def get_chat_file(username):
    folder = os.path.join(USER_DATA_FOLDER, username)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f'{get_date()}.json')

def save_chat(username, msg_data):
    file_path = get_chat_file(username)
    chat = []
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            chat = json.load(f)
    chat.append(msg_data)
    with open(file_path, 'w') as f:
        json.dump(chat, f, indent=2)

def save_media(file):
    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    return filename
    
def generate_room_id(user1, user2):
    sorted_users = sorted([user1.lower(), user2.lower()])
    room_string = f"{sorted_users[0]}_{sorted_users[1]}"
    return hashlib.sha256(room_string.encode()).hexdigest()

@app.route('/')
def home():
    if 'username' in session:
        return redirect('/pair')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        recovery = request.form['recovery']
        
        user_dir = os.path.join(USER_DATA_FOLDER, username)
        if not os.path.exists(user_dir):
            os.makedirs(user_dir)
            with open(os.path.join(user_dir, 'info.json'), 'w') as f:
                json.dump({'password': password, 'recovery': recovery}, f)
            with open(os.path.join(user_dir, 'love.txt'), 'w') as f:
                f.write(f"/monitor/{username}")
            return redirect('/')
        return "User already exists!"
    return render_template('register.html')

@app.route('/recover', methods=['GET', 'POST'])
def recover():
    if request.method == 'POST':
        username = request.form['username']
        recovery = request.form['recovery']
        file_path = get_user_file(username)
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                data = json.load(f)
            if recovery == data['recovery']:
                return f"Your password is: {data['password']}"
        return "Recovery failed."
    return render_template('recover.html')

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    password = request.form['password']
    file_path = get_user_file(username)
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            data = json.load(f)
        if data['password'] == password:
            session['username'] = username
            return redirect('/pair')
    return "Login failed."

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

@app.route('/pair', methods=['GET', 'POST'])
def pair():
    if 'username' not in session:
        return redirect(url_for('login'))

    current_user = session['username']
    user_dir = f"user_data/{current_user}"

    recent_path = os.path.join(user_dir, "recent.json")
    if not os.path.exists(recent_path):
        with open(recent_path, 'w') as f:
            json.dump([], f)

    if request.method == 'POST':
        target_user = request.form['target_user'].strip()
        target_dir = f"user_data/{target_user}"

        if not os.path.exists(target_dir):
            flash("User does not exist.")
            return redirect(url_for('pair'))

        room_id = generate_room_id(current_user, target_user)

        # Update recent list for both users
        for u in [current_user, target_user]:
            r_path = f"user_data/{u}/recent.json"
            if os.path.exists(r_path):
                with open(r_path, 'r') as f:
                    data = json.load(f)
            else:
                data = []

            if not any(d['username'] == (target_user if u == current_user else current_user) for d in data):
                data.append({"username": (target_user if u == current_user else current_user), "room": room_id})
                with open(r_path, 'w') as f:
                    json.dump(data, f)

        return redirect(url_for('chat', room=room_id))

    # GET method
    with open(recent_path, 'r') as f:
        recent = json.load(f)

    return render_template('pair.html', recent=recent)

@app.route('/chat/<room>')
def chat(room):
    if 'username' not in session:
        return redirect(url_for('login'))

    history_path = os.path.join(UPLOAD_FOLDER, room, 'messages.json')
    messages = []
    if os.path.exists(history_path):
        with open(history_path, 'r') as f:
            messages = json.load(f)

    return render_template('chat.html', username=session['username'], room=room, messages=messages)    
            

@app.route('/send', methods=['POST'])
def send():
    if 'username' not in session:
        return "Unauthorized"
    username = session['username']
    msg = request.form['message']
    msg_id = str(uuid.uuid4())
    time = get_time()
    msg_data = {'id': msg_id, 'msg': msg, 'time': time, 'from': username, 'type': 'text'}
    save_chat(username, msg_data)
    save_chat(session['room'], msg_data)
    return "OK"

@app.route('/upload', methods=['POST'])
def upload():
    if 'username' not in session:
        return "Unauthorized"
    file = request.files['file']
    if file:
        filename = save_media(file)
        msg_data = {'id': str(uuid.uuid4()), 'msg': filename, 'time': get_time(), 'from': session['username'], 'type': 'media'}
        save_chat(session['username'], msg_data)
        save_chat(session['room'], msg_data)
        return "Uploaded"
    return "Failed"

@app.route('/media/<filename>')
def media(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route('/monitor/<username>')
def monitor(username):
    return render_template('monitor.html', target=username)

@app.route('/stickers')
def stickers():
    packs = os.listdir(STICKERS_FOLDER)
    data = {}
    for pack in packs:
        pack_path = os.path.join(STICKERS_FOLDER, pack)
        stickers = os.listdir(pack_path)
        data[pack] = stickers
    return data

@app.route('/delete_msg', methods=['POST'])
def delete_msg():
    # Placeholder for frontend delete – backend retains
    return "Message hidden"

@app.route('/edit_msg', methods=['POST'])
def edit_msg():
    # Placeholder for frontend edit – admin sees original
    return "Message edited"

@app.route('/get_sticker_packs')
def get_sticker_packs():
    base_path = os.path.join('static', 'assets', 'stickers')
    packs = [f for f in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, f))]
    return jsonify(packs)


@app.route('/media/<room>/<filename>')
def media_file(room, filename):
    return send_from_directory(os.path.join(UPLOAD_FOLDER, room, 'media'), filename)


online_users = {}  # global dict to track who's online in which room

@socketio.on('join')
def on_join(data):
    username = data['username']
    room = data['room']
    join_room(room)

    # Track user as online
    if room not in online_users:
        online_users[room] = set()
    online_users[room].add(username)

    emit('status', {'msg': f'{username} has joined the room.'}, room=room)

    # Emit updated online status
    emit('user_status', {'username': username, 'status': 'online'}, room=room)
    
    
@socketio.on('send_message')
def handle_send_message(data):
    username = data['username']
    room = data['room']
    message = data['message']
    timestamp = datetime.now().strftime('%H:%M')

    entry = {
        'username': username,
        'message': message,
        'type': 'text',
        'timestamp': timestamp,
        'status': 'sent'  # Added status
    }

    room_path = os.path.join(UPLOAD_FOLDER, room)
    os.makedirs(room_path, exist_ok=True)
    history_file = os.path.join(room_path, 'messages.json')

    messages = []
    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            messages = json.load(f)

    messages.append(entry)
    with open(history_file, 'w') as f:
        json.dump(messages, f, indent=2)

    emit('new_message', entry, room=room)

@socketio.on('send_media')
def handle_send_media(data):
    import base64
    file_data = data['file']
    filename = secure_filename(data['filename'])
    username = data['username']
    room = data['room']
    timestamp = datetime.now().strftime('%H:%M')

    room_path = os.path.join(UPLOAD_FOLDER, room)
    media_folder = os.path.join(room_path, 'media')
    os.makedirs(media_folder, exist_ok=True)

    file_path = os.path.join(media_folder, filename)
    with open(file_path, 'wb') as f:
        f.write(base64.b64decode(file_data))  # Fixed: decode base64

    entry = {
        'username': username,
        'message': filename,
        'type': 'media',
        'timestamp': timestamp,
        'status': 'sent'  # Add status
    }

    history_file = os.path.join(room_path, 'messages.json')
    messages = []
    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            messages = json.load(f)
    messages.append(entry)

    with open(history_file, 'w') as f:
        json.dump(messages, f, indent=2)

    emit('new_message', entry, room=room)
    
@socketio.on('send_sticker')
def handle_send_sticker(data):
    username = data['username']
    room = data['room']
    sticker_path = data.get('sticker_path') or data.get('path') or data.get('message')
    timestamp = datetime.now().strftime('%H:%M')

    entry = {
        'username': username,
        'message': f"{sticker_path}",
        'type': 'sticker',
        'timestamp': timestamp,
        'status': 'sent'
    }

    room_path = os.path.join(UPLOAD_FOLDER, room)
    os.makedirs(room_path, exist_ok=True)
    history_file = os.path.join(room_path, 'messages.json')

    messages = []
    if os.path.exists(history_file):
        with open(history_file, 'r') as f:
            messages = json.load(f)
    messages.append(entry)

    with open(history_file, 'w') as f:
        json.dump(messages, f, indent=2)

    emit('new_message', entry, room=room)
    
    
@socketio.on("typing")
def handle_typing(data):
    emit("show_typing", {"username": data["username"]}, room=data["room"])

@socketio.on("stop_typing")
def handle_stop_typing(data):
    emit("hide_typing", room=data["room"])
    
@socketio.on('user_connected')
def handle_user_connected(data):
    room = data['room']
    username = data['username']
    emit('user_status_update', {'username': username, 'status': 'online'}, room=room)

@socketio.on('disconnect')
def handle_disconnect():
    for room in online_users:
        if request.sid in socketio.server.rooms(request.sid):
            # Assume we saved username in session during join
            username = session.get('username')
            if username in online_users[room]:
                online_users[room].remove(username)
                emit('user_status', {'username': username, 'status': 'offline'}, room=room)
        
if __name__ == '__main__':
    socketio.run(app, debug=True)
