# HeerMe – Reminder Web Application

A single-page reminder app with a calendar UI. Built with **React (Vite)** and **Node.js + Express + MongoDB**.

## Features

- **Calendar**: Month / Week / Day views (FullCalendar), responsive layout
- **Reminders**: Click a date → modal with title, description, date, time → save
- **Events**: Reminders show as calendar events; click to view details or delete
- **Search**: Filter reminders by title or description
- **Today**: Today’s date is highlighted in the calendar
- **Notifications**: Browser notifications for reminders (when the tab is open and permission granted)

## Prerequisites

- **Node.js** 18+
- **MongoDB** (local or Atlas)

## Setup

### 1. Backend

```bash
cd backend
npm install
```

Create a `.env` file (optional; defaults work for local dev):

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/heerme
```

Start the API (with auto-reload):

```bash
npm run dev
```

Backend runs at **http://localhost:5000**.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000** and proxies `/api` to the backend.

### 3. Run both

From the project root:

```bash
# Terminal 1 – backend
cd backend && npm run dev

# Terminal 2 – frontend
cd frontend && npm run dev
```

Then open **http://localhost:3000**.

## Project structure

```
heerme/
├── backend/
│   ├── models/Reminder.js    # Mongoose schema
│   ├── routes/reminders.js  # GET/POST/DELETE /api/reminders
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CalendarView.jsx
│   │   │   └── ReminderModal.jsx
│   │   ├── services/api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── planner.md
└── README.md
```

## API

| Method | Endpoint               | Description        |
|--------|------------------------|--------------------|
| GET    | `/api/reminders`       | List all reminders |
| POST   | `/api/reminders`       | Create reminder    |
| DELETE | `/api/reminders/:id`   | Delete reminder    |

**Reminder body (POST):** `{ title, description?, date (ISO), time }`

## Tech stack

- **Frontend**: React 18, Vite, FullCalendar, Tailwind CSS, Axios, react-modal
- **Backend**: Node.js, Express, Mongoose, MongoDB
