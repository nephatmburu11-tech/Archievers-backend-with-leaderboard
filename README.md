# Archievers Backend 🎓

Node.js/Express backend for the **archievers** campus knowledge hub.  
Handles **user authentication** (register / login / profile) and **file uploads** (study notes, past papers, resources).

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — change JWT_SECRET to a long random string!

# 3. Start the server
npm start          # production
npm run dev        # development (auto-restart with nodemon)
```

The server runs at **http://localhost:3000** by default.

Place your `studyhub_black_gold__1_.html` (renamed to `index.html`) inside the `public/` folder to serve it from the same server.

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint        | Auth?  | Body                                      | Returns                     |
|--------|-----------------|--------|-------------------------------------------|-----------------------------|
| POST   | `/register`     | No     | `{ name, email, password }`               | `{ token, user }`           |
| POST   | `/login`        | No     | `{ email, password }`                     | `{ token, user }`           |
| GET    | `/me`           | ✅ Yes | —                                         | `{ user }`                  |
| PUT    | `/me`           | ✅ Yes | `{ name?, email?, currentPassword?, newPassword? }` | `{ user }` |

**Token usage:** Include the token in every protected request:
```
Authorization: Bearer <your_token>
```

---

### Upload — `/api/upload`

| Method | Endpoint              | Auth?  | Body (multipart)                          | Returns          |
|--------|-----------------------|--------|-------------------------------------------|------------------|
| POST   | `/`                   | ✅ Yes | `file` + `title` + `subject` + `description?` | `{ note }` |
| GET    | `/download/:id`       | No     | —                                         | File stream      |
| DELETE | `/:id`                | ✅ Yes | —                                         | `{ message }`    |

**Allowed file types:** PDF, DOC, DOCX, PPT, PPTX, JPG, PNG, GIF, TXT  
**Max file size:** 25 MB  
**Subjects:** `cs` · `math` · `business` · `engineering` · `science` · `other`

---

### Notes — `/api/notes`

| Method | Endpoint   | Auth?    | Query Params                            | Returns                     |
|--------|------------|----------|-----------------------------------------|-----------------------------|
| GET    | `/`        | Optional | `q`, `subject`, `sort`, `page`, `limit` | `{ notes[], pagination }`   |
| GET    | `/mine`    | ✅ Yes   | —                                       | `{ notes[] }` (your uploads)|
| GET    | `/:id`     | Optional | —                                       | `{ note }`                  |

**Sort options:** `newest` (default) · `popular`

---

## Connecting the Frontend

Add this JavaScript to your HTML to wire up the login form and upload zone:

```js
const API = 'http://localhost:3000/api';

// ── Register ──────────────────────────────────────────────────
async function register(name, email, password) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (res.ok) localStorage.setItem('token', data.token);
  return data;
}

// ── Login ─────────────────────────────────────────────────────
async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok) localStorage.setItem('token', data.token);
  return data;
}

// ── Upload a file ─────────────────────────────────────────────
async function uploadNote(file, title, subject, description = '') {
  const token = localStorage.getItem('token');
  const form = new FormData();
  form.append('file', file);
  form.append('title', title);
  form.append('subject', subject);
  form.append('description', description);

  const res = await fetch(`${API}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

// ── Fetch notes ───────────────────────────────────────────────
async function getNotes(query = '', subject = 'all') {
  const params = new URLSearchParams({ q: query, subject });
  const res = await fetch(`${API}/notes?${params}`);
  return res.json();
}
```

---

## Folder Structure

```
archievers-backend/
├── server.js          # Express app + route wiring
├── db.js              # JSON file store (swap for SQLite/Postgres)
├── .env.example       # Environment variable template
├── middleware/
│   └── auth.js        # JWT verify + sign helpers
├── routes/
│   ├── auth.js        # Register, login, profile
│   ├── upload.js      # File upload, download, delete
│   └── notes.js       # List, search, detail
├── uploads/           # Uploaded files (auto-created)
├── public/            # Put your index.html here
└── db.json            # Auto-created database file
```

---

## Upgrading to a Real Database

The `db.js` file exposes just two functions: `readDB()` and `writeDB()`.  
To switch to SQLite or PostgreSQL, replace only those two functions — no route code changes needed.

---

## Security Notes

- **Change `JWT_SECRET`** before deploying to production
- Auth endpoints are rate-limited to 20 requests per 15 minutes
- Passwords are hashed with bcrypt (cost factor 12)
- File type validation checks both MIME type and extension
- Uploaded files are served with randomly generated filenames
