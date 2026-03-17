You are an expert full-stack developer. Build a complete Reminder Web Application using React.js (frontend) and Node.js + Express + MongoDB (backend).

---

## PROJECT REQUIREMENTS

Create a Single Page Application (SPA) with the following features:

1. Calendar UI:

* Use FullCalendar React library
* Show Month view by default
* Allow switching between:

  * Month view
  * Week view
  * Day view
* Calendar should be responsive and modern UI

2. Reminder Feature:

* When user clicks on any date → open modal popup
* Modal contains:

  * Title (text input)
  * Description (textarea)
  * Date (auto-filled from clicked date)
  * Time picker
  * Save button

3. Reminder Display:

* Saved reminders should appear as events on calendar
* Clicking an event should:

  * Show details
  * Option to delete

---

## FRONTEND (React)

* Use Vite for project setup

* Install dependencies:

  * @fullcalendar/react
  * @fullcalendar/daygrid
  * @fullcalendar/timegrid
  * @fullcalendar/interaction
  * axios
  * react-modal or any lightweight modal library

* Structure:
  src/
  components/
  CalendarView.jsx
  ReminderModal.jsx
  services/
  api.js
  App.jsx

* Features:

  * Fetch reminders from backend
  * Convert reminders to FullCalendar events format
  * Handle dateClick and eventClick

---

## BACKEND (Node + Express)

* Setup Express server

* Connect MongoDB using Mongoose

* Create Reminder Schema:
  {
  title: String,
  description: String,
  date: Date,
  time: String,
  createdAt: Date
  }

* API Endpoints:

  * GET /api/reminders → fetch all reminders
  * POST /api/reminders → create reminder
  * DELETE /api/reminders/:id → delete reminder

---

## INTEGRATION

* Use Axios to connect frontend with backend
* Store backend URL in environment variable

---

## UI/UX

* Clean modern design
* Use Tailwind CSS (optional but preferred)
* Modal should be centered and user-friendly

---

## BONUS (if possible)

* Add notification reminder (browser notification)
* Add search functionality
* Highlight today's date

---

## OUTPUT FORMAT

* Generate full working code:

  * React frontend
  * Node backend
  * MongoDB schema
* Include setup instructions
* Include package.json files
* Ensure project runs with:
  npm install
  npm run dev

---

Focus on clean code, modular structure, and best practices.

Application name is "HeerMe"