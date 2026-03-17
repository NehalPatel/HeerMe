import express from 'express';
import Reminder from '../models/Reminder.js';

const router = express.Router();

// GET /api/reminders - fetch all reminders
router.get('/', async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ date: 1, time: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reminders - create reminder
router.post('/', async (req, res) => {
  try {
    const { title, description, date, time, priority, category } = req.body;
    if (!title || !date || !time) {
      return res.status(400).json({ error: 'Title, date and time are required' });
    }
    const reminder = new Reminder({
      title,
      description: description || '',
      date: new Date(date),
      time: String(time),
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      category: ['Academic', 'Personal', 'Other'].includes(category) ? category : 'Personal'
    });
    await reminder.save();
    res.status(201).json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/reminders/:id - delete reminder
router.delete('/:id', async (req, res) => {
  try {
    const reminder = await Reminder.findByIdAndDelete(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
