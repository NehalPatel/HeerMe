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

// GET /api/reminders/:id - fetch one reminder by id
router.get('/:id', async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
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

// PUT /api/reminders/:id/close - close reminder with final status + comments
router.put('/:id/close', async (req, res) => {
  try {
    const { status, comments } = req.body;
    const allowedStatus = ['open', 'in-progress', 'completed', 'invalid'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ error: 'Status must be one of: open, in-progress, completed, invalid' });
    }
    const reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        status,
        comments: typeof comments === 'string' ? comments : ''
      },
      { new: true }
    );
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/reminders/:id - update reminder fields (edit task)
router.put('/:id', async (req, res) => {
  try {
    const {
      title,
      description,
      date,
      time,
      priority,
      category,
      status,
      comments
    } = req.body || {};

    if (!title || !date || !time) {
      return res.status(400).json({ error: 'Title, date and time are required' });
    }

    const allowedPriority = ['low', 'medium', 'high'];
    const allowedCategory = ['Academic', 'Personal', 'Other'];
    const allowedStatus = ['open', 'in-progress', 'completed', 'invalid'];

    const reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      {
        title: String(title),
        description: typeof description === 'string' ? description : '',
        date: new Date(date),
        time: String(time),
        priority: allowedPriority.includes(priority) ? priority : 'medium',
        category: allowedCategory.includes(category) ? category : 'Personal',
        status: allowedStatus.includes(status) ? status : 'open',
        comments: typeof comments === 'string' ? comments : ''
      },
      { new: true }
    );

    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    res.json(reminder);
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
