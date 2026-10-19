// Sample data used by both the Postgres seed script and the browser demo.
export const PASSWORD = 'password123'

export const USERS = [
  { key: 'maya', name: 'Maya Chen', email: 'maya@skillswap.test', bio: 'Second year biology student. Trying to finally learn guitar and get less scared of code.' },
  { key: 'liam', name: 'Liam Carter', email: 'liam@skillswap.test', bio: 'Music major. I have been playing guitar for nine years and teaching friends for three.' },
  { key: 'sarah', name: 'Sarah Kim', email: 'sarah@skillswap.test', bio: 'CS junior, TA for the intro programming course. Patient with first timers.' },
  { key: 'ben', name: 'Ben Okafor', email: 'ben@skillswap.test', bio: 'I shoot for the campus paper. Mostly street and event photography.' },
  { key: 'emily', name: 'Emily Ross', email: 'emily@skillswap.test', bio: 'Illustration student. Procreate, Krita and a lot of sketchbooks.' },
  { key: 'chloe', name: 'Chloe Martin', email: 'chloe@skillswap.test', bio: 'Worked two summers in a bakery. Happy to teach bread and simple pastry.' },
  { key: 'david', name: 'David Moreau', email: 'david@skillswap.test', bio: 'Grew up in Lyon. Conversation practice, no grammar drills unless you want them.' },
  { key: 'aisha', name: 'Aisha Rahman', email: 'aisha@skillswap.test', bio: 'Math and stats tutor. I like explaining things with pictures.' },
  { key: 'admin', name: 'Moderator', email: 'mod@skillswap.test', bio: 'Handles disputes.', role: 'admin' },
]

export const SKILLS = [
  { key: 'guitar', teacher: 'liam', title: 'Guitar Basics', category: 'Music', level: 'Beginner', creditsPerHour: 20,
    description: 'Open chords, strumming patterns and your first three songs. Bring any acoustic guitar, I will help you tune it.' },
  { key: 'python', teacher: 'sarah', title: 'Python for Beginners', category: 'Programming', level: 'Beginner', creditsPerHour: 25,
    description: 'Variables, loops, functions and small scripts that do something useful. We write code together in a shared editor.' },
  { key: 'photo', teacher: 'ben', title: 'Photography 101', category: 'Arts', level: 'Beginner', creditsPerHour: 20,
    description: 'Exposure, composition and how to get out of auto mode. Phone cameras are fine.' },
  { key: 'digital', teacher: 'emily', title: 'Digital Illustration', category: 'Design', level: 'Intermediate', creditsPerHour: 30,
    description: 'Layers, brushes and a clean workflow from sketch to finished piece in Procreate or Krita.' },
  { key: 'baking', teacher: 'chloe', title: 'Baking Bread at Home', category: 'Cooking', level: 'Beginner', creditsPerHour: 15,
    description: 'A simple no-knead loaf, then focaccia. We bake live, so have flour, yeast and salt ready.' },
  { key: 'french', teacher: 'david', title: 'French Conversation', category: 'Languages', level: 'Intermediate', creditsPerHour: 20,
    description: 'Talk about everyday things in French. I correct gently and send you a short list of phrases after.' },
  { key: 'stats', teacher: 'aisha', title: 'Statistics Without Tears', category: 'Academics', level: 'Beginner', creditsPerHour: 25,
    description: 'Distributions, hypothesis tests and p-values for your stats course, explained with examples from your homework.' },
  { key: 'js', teacher: 'sarah', title: 'JavaScript and the DOM', category: 'Programming', level: 'Intermediate', creditsPerHour: 30,
    description: 'Build a small interactive page from scratch. Events, fetch and a bit of debugging in devtools.' },
  { key: 'lightroom', teacher: 'ben', title: 'Editing in Lightroom', category: 'Arts', level: 'Intermediate', creditsPerHour: 25,
    description: 'Color, contrast and a repeatable editing process. Bring ten of your own photos.' },
  { key: 'yoga', teacher: 'aisha', title: 'Morning Yoga Flow', category: 'Fitness', level: 'Beginner', creditsPerHour: 10,
    description: 'A gentle 30 to 45 minute flow for stiff students who sit all day.' },
  { key: 'notes', teacher: 'maya', title: 'Lab Reports That Get Good Grades', category: 'Academics', level: 'Beginner', creditsPerHour: 15,
    description: 'How I structure lab reports, figures and citations for biology and chemistry courses.' },
]

// Past sessions that give everyone some history and ratings.
export const HISTORY = [
  { skill: 'guitar', learner: 'sarah', daysAgo: 20, rating: 5, comment: 'Liam had me playing a full song by the end. Really clear.' },
  { skill: 'guitar', learner: 'david', daysAgo: 12, rating: 5, comment: 'Patient and fun. My fingers hurt but in a good way.' },
  { skill: 'guitar', learner: 'emily', daysAgo: 6, rating: 4, comment: 'Good intro to strumming. Would have liked a little more theory.' },
  { skill: 'python', learner: 'maya', daysAgo: 15, rating: 5, comment: 'I finally get loops. Sarah explains things without making you feel slow.' },
  { skill: 'python', learner: 'ben', daysAgo: 9, rating: 5, comment: 'We automated renaming my photo files. Super practical.' },
  { skill: 'photo', learner: 'chloe', daysAgo: 14, rating: 5, comment: 'My food photos look so much better now.' },
  { skill: 'photo', learner: 'aisha', daysAgo: 4, rating: 4, comment: 'Lots of useful tips about light.' },
  { skill: 'digital', learner: 'liam', daysAgo: 10, rating: 5, comment: 'Emily showed me a workflow I am still using for album art.' },
  { skill: 'baking', learner: 'david', daysAgo: 8, rating: 5, comment: 'The focaccia actually worked. My roommates are happy.' },
  { skill: 'baking', learner: 'maya', daysAgo: 3, rating: 4, comment: 'Fun session, easy to follow along.' },
  { skill: 'french', learner: 'emily', daysAgo: 11, rating: 5, comment: 'Relaxed and helpful. Great for confidence.' },
  { skill: 'stats', learner: 'liam', daysAgo: 7, rating: 5, comment: 'Saved me before my midterm.' },
  { skill: 'notes', learner: 'david', daysAgo: 5, rating: 5, comment: 'Clear structure, I used it the same night.' },
  { skill: 'notes', learner: 'chloe', daysAgo: 2, rating: 4, comment: 'Helpful template for figures.' },
  { skill: 'notes', learner: 'sarah', daysAgo: 1, rating: 5, comment: 'Wish I had this in first year.' },
]

// Upcoming availability, relative to the moment data is seeded.
// The first slot of every skill starts in a few minutes so the session room can be tried right away.
export function slotTimes(index, now = Date.now()) {
  const base = new Date(now)
  base.setMinutes(0, 0, 0)
  const out = [{ startsAt: new Date(now + 5 * 60000).toISOString(), minutes: 60 }]
  for (let d = 1; d <= 10; d++) {
    if ((d + index) % 3 === 0) continue
    const t = new Date(base.getTime() + d * 86400000)
    t.setHours(16 + ((index + d) % 4), 0, 0, 0)
    out.push({ startsAt: t.toISOString(), minutes: 60 })
  }
  return out
}
