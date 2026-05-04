import streamlit as st
import requests
import json
import uuid
import os
import time

# --- НАСТРОЙКИ СТРАНИЦЫ (Делаем стильно и широко) ---
st.set_page_config(page_title="AI Assistant", page_icon="✨", layout="wide")

# --- БЕЗОПАСНОСТЬ: ДОСТАЕМ КЛЮЧИ ИЗ СЕКРЕТОВ ---
try:
    API_KEY = st.secrets["FIREWORKS_API_KEY"]
    ADMIN_PASS = st.secrets["ADMIN_PASSWORD"]
except KeyError:
    st.error("🚨 Ошибка сервера: Не настроены секретные ключи. Обратитесь к администратору.")
    st.stop()

# --- ФАЙЛ ДЛЯ ХРАНЕНИЯ ИСТОРИИ ---
DB_FILE = "chat_history.json"

def save_data():
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump({"chats": st.session_state.chats, "current_chat_id": st.session_state.current_chat_id}, f, ensure_ascii=False, indent=2)

def load_data():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except: return None
    return None

# --- ИНИЦИАЛИЗАЦИЯ ---
saved_data = load_data()
if "chats" not in st.session_state:
    if saved_data:
        st.session_state.chats = saved_data["chats"]
        st.session_state.current_chat_id = saved_data["current_chat_id"]
    else:
        first_id = str(uuid.uuid4())
        st.session_state.chats = {first_id: {"title": "Новый диалог", "messages": []}}
        st.session_state.current_chat_id = first_id

if "is_admin" not in st.session_state:
    st.session_state.is_admin = False

# Базовые настройки для обычных пользователей
if "current_model" not in st.session_state:
    st.session_state.current_model = "accounts/fireworks/models/qwen3p6-plus"
if "current_temp" not in st.session_state:
    st.session_state.current_temp = 0.6

AVAILABLE_MODELS = {
    "Qwen 3.6 Plus (Быстрая)": "accounts/fireworks/models/qwen3p6-plus",
    "DeepSeek V4 Pro (Умная)": "accounts/fireworks/models/deepseek-v4-pro",
    "Kimi 2.6": "accounts/fireworks/models/kimi-k2p6"
}

def get_ai_response_stream(messages):
    url = "https://api.fireworks.ai/inference/v1/chat/completions"
    payload = {"model": st.session_state.current_model, "max_tokens": 4096, "temperature": st.session_state.current_temp, "messages": messages, "stream": True}
    headers = {"Accept": "application/json", "Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"}
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), stream=True)
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    data_str = line[6:]
                    if data_str == '[DONE]': break
                    try:
                        chunk = json.loads(data_str)["choices"][0]["delta"].get("content", "")
                        if chunk: yield chunk
                    except: continue
    except Exception as e: yield f"❌ Ошибка соединения."

# --- БОКОВАЯ ПАНЕЛЬ (Пользовательский вид) ---
with st.sidebar:
    # Логотип или название (как у Claude)
    st.title("✨ My AI")
    
    if st.button("➕ Новый чат", use_container_width=True, type="primary"):
        new_id = str(uuid.uuid4())
        st.session_state.chats[new_id] = {"title": "Новый диалог", "messages": []}
        st.session_state.current_chat_id = new_id
        save_data()
        st.rerun()

    st.markdown("### История диалогов")
    for cid, data in reversed(st.session_state.chats.items()):
        is_act = (cid == st.session_state.current_chat_id)
        if st.button(f"{data['title']}", key=cid, use_container_width=True, type="secondary" if not is_act else "primary"):
            st.session_state.current_chat_id = cid
            save_data()
            st.rerun()

    st.divider()
    
    # СКРЫТАЯ АДМИНКА
    with st.expander("⚙️"):
        if not st.session_state.is_admin:
            pwd = st.text_input("Пароль", type="password")
            if pwd == ADMIN_PASS:
                st.session_state.is_admin = True
                st.rerun()
            elif pwd:
                st.error("Неверно")
        else:
            st.success("Режим Админа")
            selected_model_name = st.selectbox("Сменить модель для всех:", options=list(AVAILABLE_MODELS.keys()))
            st.session_state.current_model = AVAILABLE_MODELS[selected_model_name]
            st.session_state.current_temp = st.slider("Температура:", 0.0, 1.0, 0.6)
            if st.button("Выйти из админки"):
                st.session_state.is_admin = False
                st.rerun()

# --- ОСНОВНОЙ ИНТЕРФЕЙС ЧАТА ---
current_chat = st.session_state.chats[st.session_state.current_chat_id]

# Если чат пустой, показываем приветствие как в Claude
if not current_chat["messages"]:
    st.markdown("<h2 style='text-align: center; color: gray; margin-top: 10vh;'>Чем я могу помочь вам сегодня?</h2>", unsafe_allow_html=True)

# Отрисовка сообщений
for msg in current_chat["messages"]:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Ввод пользователя
if prompt := st.chat_input("Напишите сообщение..."):
    if not current_chat["messages"]:
        current_chat["title"] = prompt[:30] + "..."

    with st.chat_message("user"):
        st.markdown(prompt)

    current_chat["messages"].append({"role": "user", "content": prompt})

    with st.chat_message("assistant"):
        start_time = time.time()
        status = st.empty()
        status.markdown("⏳ *Думаю...*")
        
        raw_stream = get_ai_response_stream(current_chat["messages"])
        
        def stream_wrapper():
            first_chunk = True
            for chunk in raw_stream:
                if first_chunk:
                    status.empty()
                    first_chunk = False
                yield chunk

        full_resp = st.write_stream(stream_wrapper())
        
    current_chat["messages"].append({"role": "assistant", "content": full_resp})
    save_data()
    st.rerun()
