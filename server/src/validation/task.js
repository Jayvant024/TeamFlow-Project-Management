const validStatuses = ['todo', 'in_progress', 'done']
const validPriorities = ['low', 'medium', 'high', 'urgent']

function invalid(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function validateTask(body, partial = false) {
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 180) throw invalid('Task title is required (180 characters max).')
  }
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 5000)) throw invalid('Description must be 5,000 characters or fewer.')
  if (body.status !== undefined && !validStatuses.includes(body.status)) throw invalid('Choose a valid task status.')
  if (body.priority !== undefined && !validPriorities.includes(body.priority)) throw invalid('Choose a valid task priority.')
  if (body.due_date !== undefined && body.due_date !== null) {
    const date = typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date)
      ? new Date(`${body.due_date}T00:00:00.000Z`)
      : null
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body.due_date) {
      throw invalid('Due date must be a valid date in YYYY-MM-DD format.')
    }
  }
  if (body.assignee_id !== undefined && body.assignee_id !== null && (!/^\d+$/.test(String(body.assignee_id)) || Number(body.assignee_id) < 1)) {
    throw invalid('Choose a valid project member to assign this task.')
  }
}

module.exports = { validateTask }
