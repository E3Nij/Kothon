/* ==========================================================================
   কথন (Kothon) — script.js   (vanilla JS, file:// compatible, no modules)
   Sections:
     1  Constants & utilities
     2  Storage (localStorage wrapper with memory fallback)
     3  Sanitizer (whitelist) & text helpers
     4  Auth (hashing, register, login, logout, session)
     5  Data layer (posts: create / update / delete with ownership checks)
     6  UI helpers (toast, confirm modal, menu)
     7  Router (hash routing + leave guard)
     8  Views (home, category, about, login, post, my, 404)
     9  Editor (write page: toolbar, paste, cover, video, drafts)
    10  Init
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     1. CONSTANTS & UTILITIES
     ====================================================================== */
  var K = { users: 'kothon:users', posts: 'kothon:posts', session: 'kothon:session', token: 'kothon:token', seeded: 'kothon:seeded', draft: 'kothon:draft:' };
  var TITLE_MAX = 120;
  var PER_PAGE = 9;
  var CATS = {
    poetry:     { bn: 'কবিতা',   en: 'Poetry',     lead: 'ছন্দ, ভাব আর অনুভূতির কবিতা।' },
    stories:    { bn: 'গল্প',    en: 'Stories',    lead: 'ছোট-বড় নানা স্বাদের গল্প।' },
    novels:     { bn: 'উপন্যাস', en: 'Novels',     lead: 'ধারাবাহিক ও পূর্ণাঙ্গ উপন্যাস।' },
    articles:   { bn: 'প্রবন্ধ',  en: 'Articles',   lead: 'ভাবনা, বিশ্লেষণ ও মতামতের প্রবন্ধ।' },
    literature: { bn: 'সাহিত্য', en: 'Literature', lead: 'সাহিত্য নিয়ে আলোচনা, সমালোচনা ও মননশীল লেখা।' }
  };

  var state = {
    users: [], posts: [], user: null, returnTo: '',
    route: { name: 'home', arg: '' }, currentHash: '#home', skipGuard: false,
    writeActive: false, write: null, draftTimer: null, savedRange: null,
    catKey: '', modalOpen: false, currentPostId: '', keepScroll: false
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function bn(n) { return lang === 'en' ? String(n) : String(n).replace(/\d/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function formatDate(ts) {
    try { return new Date(ts).toLocaleDateString(lang === 'en' ? 'en-GB' : 'bn-BD', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return bn(new Date(ts).toISOString().slice(0, 10)); }
  }
  function formatTime(ts) {
    try { return new Date(ts).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'bn-BD', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return bn(new Date(ts).toTimeString().slice(0, 5)); }
  }
  function countWords(t) { t = (t || '').trim(); return t ? t.split(/\s+/).length : 0; }
  function readMinutes(words) { return words ? Math.max(1, Math.ceil(words / 180)) : 0; }
  function go(hash) { if (location.hash === hash) { route(); } else { location.hash = hash; } }
  function redirect(hash) { history.replaceState(null, '', hash); route(); }

  /* ======================================================================
     1b. LANGUAGE (Bengali <-> English) & THEME (day / night)
     Source strings in the HTML/JS are Bengali; EN maps them to English.
     t() translates at runtime; applyLang() translates the static markup.
     ====================================================================== */
  var lang = 'bn';
  var EN = {
    'মূল অংশে যান': 'Skip to main content',
    'কথন — হোম পেজ': 'Kothon — home', 'প্রধান মেনু': 'Main menu', 'মেনু খুলুন': 'Open menu', 'মেনু বন্ধ করুন': 'Close menu',
    'হোম': 'Home', 'কবিতা': 'Poetry', 'গল্প': 'Stories', 'উপন্যাস': 'Novels', 'প্রবন্ধ': 'Articles', 'সাহিত্য': 'Literature',
    'আমাদের কথা': 'About us', 'লগইন': 'Login', 'লিখুন': 'Write', 'লগআউট': 'Logout', 'আমার লেখাসমূহ': 'My posts',
    'রাত মোডে যান': 'Switch to night mode', 'দিন মোডে যান': 'Switch to day mode',
    'মনের কথা, কলমের ভাষায় — সবার জন্য একটি খোলা আসর।': 'Thoughts of the heart in the language of the pen — an open gathering for everyone.',
    'আপনার লেখা প্রকাশ করুন': 'Publish your writing', 'কথন কী?': 'What is Kothon?',
    'বিষয় বেছে নিন': 'Browse by category', 'বিভাগসমূহ': 'Categories', 'সাম্প্রতিক লেখা': 'Latest posts',
    'লেখা খুঁজুন': 'Search posts', 'খুঁজুন': 'Search', 'শিরোনাম, লেখক বা লেখার অংশ খুঁজুন…': 'Search by title, author or text…',
    'বিভাগ': 'Category', 'সব বিভাগ': 'All categories', 'সাজান': 'Sort', 'নতুন আগে': 'Newest first', 'পুরনো আগে': 'Oldest first',
    'আরও দেখুন': 'Load more', 'কোনো লেখা পাওয়া যায়নি': 'No posts found', 'অন্য শব্দে খুঁজে দেখুন, অথবা ফিল্টার বদলান।': 'Try different words or change the filter.',
    'কথন এমন একটি জায়গা, যেখানে যে কেউ নিজের লেখা প্রকাশ করতে এবং অন্যের লেখা পড়তে পারেন।': 'Kothon is a place where anyone can publish their own writing and read what others have written.',
    'কথন কী': 'What Kothon is',
    '“কথন” মানে বলা, আলাপ। এই প্ল্যাটফর্মে কবি, গল্পকার, ঔপন্যাসিক ও প্রাবন্ধিকেরা নিজেদের লেখা একসঙ্গে প্রকাশ করেন। কোনো ইমেইল বা যাচাইকরণ লাগে না — শুধু একটি ইউজারনেম ও পাসওয়ার্ড।': '“Kothon” means speaking, conversation. Poets, storytellers, novelists and essayists publish their work here together. No email or verification is needed — just a username and password.',
    'কীভাবে কাজ করে': 'How it works',
    'নিবন্ধন করুন।': 'Register.', 'ইউজারনেম ও পাসওয়ার্ড দিয়ে অ্যাকাউন্ট খুলুন।': 'Create an account with a username and password.',
    'লিখুন।': 'Write.', 'বিভাগ বেছে নিন, শিরোনাম দিন, এডিটরে লেখা সাজান। চাইলে ছবি বা ভিডিও যোগ করুন।': 'Pick a category, add a title and shape your text in the editor. Add a picture or video if you like.',
    'প্রকাশ করুন।': 'Publish.', 'প্রকাশ করলেই লেখা হোম পেজ ও সংশ্লিষ্ট বিভাগে দেখা যাবে।': 'Once published, your post appears on the home page and in its category.',
    'পরিচালনা করুন।': 'Manage.', '“আমার লেখা” পাতা থেকে নিজের লেখা সম্পাদনা বা মুছে ফেলুন।': 'Edit or delete your posts from the “My posts” page.',
    'লেখকেরা যা করতে পারেন': 'What writers can do',
    'কবিতা, গল্প, উপন্যাস, প্রবন্ধ ও সাহিত্য — পাঁচ বিভাগে লেখা প্রকাশ': 'Publish in five categories: poetry, stories, novels, articles and literature',
    'বোল্ড, ইটালিক, শিরোনাম, উদ্ধৃতি ও তালিকাসহ সমৃদ্ধ এডিটর': 'A rich editor with bold, italic, headings, quotes and lists',
    'ঐচ্ছিক কভার ছবি এবং YouTube বা সরাসরি ভিডিও লিংক': 'Optional cover image and a YouTube or direct video link',
    'স্বয়ংক্রিয় ড্রাফট সংরক্ষণ — ভুলে পাতা বন্ধ হলেও লেখা হারায় না': 'Automatic draft saving — nothing is lost if you close the page by mistake',
    'নিজের লেখা যেকোনো সময় সম্পাদনা ও মুছে ফেলা': 'Edit or delete your own posts at any time',
    'আপনার তথ্য কোথায় থাকে': 'Where your data lives',
    'সব লেখা ও অ্যাকাউন্টের তথ্য অনলাইন সার্ভারে সংরক্ষিত থাকে, তাই যেকোনো ডিভাইস থেকে লগইন করা যায়। পাসওয়ার্ড হ্যাশ করে রাখা হয়, সাধারণ লেখা হিসেবে নয়।': 'All posts and account details are stored on an online server, so you can log in from any device. Passwords are stored hashed, never as plain text.',
    'যোগ দিন': 'Join us',
    'এই বিভাগে খুঁজুন': 'Search this category', 'এই বিভাগে খুঁজুন…': 'Search this category…',
    'এই বিভাগে এখনও কোনো লেখা নেই': 'There are no posts in this category yet', 'প্রথম লেখাটি আপনার হতে পারে।': 'The first post could be yours.', 'লেখা শুরু করুন': 'Start writing',
    'কোনো ফলাফল পাওয়া যায়নি': 'No results found',
    'কথনে স্বাগতম': 'Welcome to Kothon', 'লগইন বা নিবন্ধন': 'Login or register', 'নিবন্ধন': 'Register',
    'ইউজারনেম': 'Username', 'পাসওয়ার্ড': 'Password', 'দেখান': 'Show', 'লুকান': 'Hide', 'পাসওয়ার্ড দেখান': 'Show password', 'পাসওয়ার্ড লুকান': 'Hide password',
    'লগইন করুন': 'Log in', 'অ্যাকাউন্ট নেই?': 'No account?', 'নিবন্ধন করুন': 'Register',
    '৩–২৪ অক্ষর। বাংলা/ইংরেজি অক্ষর, সংখ্যা, ডট (.), আন্ডারস্কোর (_) ও হাইফেন (-) চলবে।': '3–24 characters. Letters (Bengali or English), numbers, dot (.), underscore (_) and hyphen (-) are allowed.',
    'কমপক্ষে ৪ অক্ষর।': 'At least 4 characters.', 'পাসওয়ার্ড আবার দিন': 'Confirm password', 'অ্যাকাউন্ট খুলুন': 'Create account',
    'আগে থেকেই অ্যাকাউন্ট আছে?': 'Already have an account?',
    '← ফিরে যান': '← Back', 'সম্পাদনা': 'Edit', 'মুছে ফেলুন': 'Delete', 'মুছুন': 'Delete', 'সম্পাদিত': 'Edited',
    'নতুন লেখা': 'New post', 'লেখা সম্পাদনা': 'Edit post', 'পরিবর্তন সংরক্ষণ করুন': 'Save changes',
    'শিরোনাম': 'Title', 'লেখা': 'Writing', 'লেখা সাজানোর টুল': 'Formatting tools',
    'এখানে আপনার লেখা শুরু করুন…': 'Start writing here…',
    'বোল্ড': 'Bold', 'বোল্ড (Ctrl+B)': 'Bold (Ctrl+B)', 'ইটালিক': 'Italic', 'ইটালিক (Ctrl+I)': 'Italic (Ctrl+I)',
    'আন্ডারলাইন': 'Underline', 'আন্ডারলাইন (Ctrl+U)': 'Underline (Ctrl+U)',
    'বড় শিরোনাম': 'Heading', 'উপশিরোনাম': 'Subheading', 'উদ্ধৃতি': 'Quote', 'সাধারণ অনুচ্ছেদ': 'Normal paragraph', 'অনুচ্ছেদ': 'Paragraph',
    'বুলেট তালিকা': 'Bullet list', '• তালিকা': '• List', 'ক্রমিক তালিকা': 'Numbered list', '১. তালিকা': '1. List',
    'বামে সাজান': 'Align left', 'মাঝে সাজান': 'Align center', 'ডানে সাজান': 'Align right', 'বাম': 'Left', 'মাঝ': 'Center', 'ডান': 'Right',
    'আনডু': 'Undo', 'রিডু': 'Redo', 'ফরম্যাট মুছুন': 'Clear formatting',
    'কভার ছবি': 'Cover image', '(ঐচ্ছিক)': '(optional)', 'ছবি বেছে নিন': 'Choose image',
    'PNG, JPG, WebP বা GIF। ছবি স্বয়ংক্রিয়ভাবে ছোট করে সংরক্ষিত হবে।': 'PNG, JPG, WebP or GIF. The image is resized and compressed automatically.',
    'কভার ছবির প্রিভিউ': 'Cover image preview', 'ছবি সরান': 'Remove image',
    'ভিডিও লিংক': 'Video link', 'YouTube লিংক অথবা .mp4 / .webm ফাইলের লিংক': 'YouTube link or a direct .mp4 / .webm link',
    'বাতিল': 'Cancel', 'প্রকাশ করুন': 'Publish', 'নিশ্চিত করুন': 'Confirm',
    'আমার লেখা': 'My posts', 'এখানে আপনার সব লেখা দেখা যাবে।': 'All your posts will appear here.',
    'এখনও কোনো লেখা প্রকাশ করেননি': 'You haven’t published anything yet', 'আপনার প্রথম লেখাটি আজই প্রকাশ করুন।': 'Publish your first post today.', 'প্রথম লেখাটি লিখুন': 'Write your first post',
    '৪০৪': '404', 'পাতাটি খুঁজে পাওয়া গেল না': 'Page not found', 'পাতা পাওয়া যায়নি': 'Page not found',
    'আপনি যে লেখা বা পাতা খুঁজছেন, সেটি সরানো হয়েছে অথবা ঠিকানাটি ভুল।': 'The post or page you are looking for was removed, or the address is wrong.',
    'হোম পেজে ফিরুন': 'Back to home', 'লগইন / নিবন্ধন': 'Login / Register',
    'ফুটার মেনু': 'Footer menu', 'লেখকদের খোলা আসর': 'An open gathering for writers',
    'কথন। প্রতিটি লেখার স্বত্ব তার লেখকের।': 'Kothon. Every piece belongs to its author.',
    'ছন্দ, ভাব আর অনুভূতির কবিতা।': 'Poems of rhythm, feeling and emotion.', 'ছোট-বড় নানা স্বাদের গল্প।': 'Stories big and small, of every flavour.',
    'ধারাবাহিক ও পূর্ণাঙ্গ উপন্যাস।': 'Serialised and complete novels.', 'ভাবনা, বিশ্লেষণ ও মতামতের প্রবন্ধ।': 'Essays of thought, analysis and opinion.',
    'সাহিত্য নিয়ে আলোচনা, সমালোচনা ও মননশীল লেখা।': 'Discussion, criticism and thoughtful writing about literature.',
    /* toasts, errors, dialogs */
    'এই পাতা দেখতে আগে লগইন করুন।': 'Please log in to view this page.', 'আপনি লগআউট করেছেন।': 'You have logged out.',
    'লেখাটি মুছে ফেলা হয়েছে।': 'The post has been deleted.', 'অন্যের লেখা সম্পাদনা করা যায় না।': 'You cannot edit someone else’s post.',
    'অন্যের লেখা মুছে ফেলা যায় না।': 'You cannot delete someone else’s post.', 'আগের অসম্পূর্ণ ড্রাফট ফিরিয়ে আনা হয়েছে।': 'Your unfinished draft was restored.',
    'কভার ছবি যোগ হয়েছে।': 'Cover image added.', 'কভার ছবি সরানো হয়েছে।': 'Cover image removed.',
    'অনুগ্রহ করে লাল চিহ্নিত ত্রুটিগুলো ঠিক করুন।': 'Please fix the errors shown in red.',
    'পরিবর্তন সংরক্ষিত হয়েছে।': 'Changes saved.', 'লেখাটি প্রকাশিত হয়েছে।': 'Your post has been published.',
    'লোকাল স্টোরেজ বন্ধ আছে — পাতা বন্ধ করলে লেখা হারিয়ে যাবে।': 'Local storage is disabled — your data will be lost when you close the page.',
    'ব্রাউজারের সঞ্চয়স্থান ভরে গেছে। ছবি ছোট করুন বা পুরনো লেখা মুছে ফেলুন।': 'Browser storage is full. Use a smaller image or delete older posts.',
    'ইউজারনেম দিন।': 'Enter a username.', 'ইউজারনেম ৩ থেকে ২৪ অক্ষরের হতে হবে।': 'The username must be 3 to 24 characters long.',
    'ইউজারনেমে শুধু অক্ষর, সংখ্যা, ডট (.), আন্ডারস্কোর (_) ও হাইফেন (-) চলবে।': 'Usernames can only contain letters, numbers, dot (.), underscore (_) and hyphen (-).',
    'পাসওয়ার্ড দিন।': 'Enter a password.', 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।': 'The password must be at least 4 characters.',
    'দুটি পাসওয়ার্ড মেলেনি।': 'The two passwords do not match.', 'এই ইউজারনেমটি আগে থেকেই নেওয়া আছে।': 'This username is already taken.',
    'অ্যাকাউন্ট সংরক্ষণ করা যায়নি — ব্রাউজারের জায়গা শেষ।': 'Could not save the account — browser storage is full.',
    'ইউজারনেম ও পাসওয়ার্ড দুটোই দিন।': 'Enter both a username and a password.', 'এই ইউজারনেমে কোনো অ্যাকাউন্ট নেই।': 'No account exists with this username.',
    'পাসওয়ার্ড ভুল হয়েছে।': 'Wrong password.', 'লেখা প্রকাশ করতে লগইন করুন।': 'Log in to publish a post.',
    'লেখাটি পাওয়া যায়নি।': 'Post not found.', 'সংরক্ষণ করা যায়নি।': 'Could not save.', 'মুছে ফেলা যায়নি।': 'Could not delete.',
    'শিরোনাম লিখুন।': 'Enter a title.', 'লেখার অংশ খালি রাখা যাবে না।': 'The post text cannot be empty.',
    'সঠিক YouTube লিংক অথবা .mp4 / .webm ফাইলের লিংক দিন।': 'Enter a valid YouTube link or a direct .mp4 / .webm link.',
    'শুধু PNG, JPG, WebP বা GIF ছবি দিন।': 'Only PNG, JPG, WebP or GIF images are allowed.',
    'ছবিটি অনেক বড় (সর্বোচ্চ ১৫ MB)।': 'The image is too large (15 MB maximum).', 'ছবিটি পড়া যায়নি। অন্য ছবি চেষ্টা করুন।': 'Could not read the image. Try another one.',
    'ড্রাফট সংরক্ষণ করা যায়নি (জায়গা শেষ)। ছবি ছোট করুন।': 'Could not save the draft (storage full). Use a smaller image.',
    'পাতা ছেড়ে যাবেন?': 'Leave this page?', 'আপনার অসংরক্ষিত পরিবর্তন আছে। ড্রাফট হিসেবে সংরক্ষিত থাকবে, পরে আবার এসে চালিয়ে যেতে পারবেন।': 'You have unsaved changes. They are kept as a draft so you can continue later.',
    'ছেড়ে যান': 'Leave', 'থাকুন': 'Stay',
    'লগআউট করবেন?': 'Log out?', 'আপনার অসংরক্ষিত লেখা ড্রাফট হিসেবে সংরক্ষিত থাকবে।': 'Your unsaved writing is kept as a draft.',
    'লেখাটি মুছে ফেলবেন?': 'Delete this post?',
    'লেখা বাতিল করবেন?': 'Discard this post?', 'অসংরক্ষিত পরিবর্তন ও ড্রাফট মুছে যাবে।': 'Unsaved changes and the draft will be lost.',
    'বাতিল করুন': 'Discard', 'লিখতে থাকুন': 'Keep writing'
  };
  var EN_RE = [
    [/^মোট (\d+) টি লেখা$/, '$1 posts in total'],
    [/^(\d+) টি লেখা$/, '$1 posts'],
    [/^(\d+) টি ফলাফল পাওয়া গেছে$/, '$1 results found'],
    [/^আপনার মোট (\d+) টি লেখা আছে।$/, 'You have $1 posts.'],
    [/^পড়তে প্রায় (\d+) মিনিট$/, '$1 min read'],
    [/^(\d+) শব্দ · পড়তে (?:প্রায় )?(\d+) মিনিট$/, '$1 words · $2 min read'],
    [/^ড্রাফট সংরক্ষিত — (.+)$/, 'Draft saved — $1'],
    [/^সম্পাদিত: (.+)$/, 'Edited: $1'],
    [/^স্বাগতম, (.+)!$/, 'Welcome, $1!'],
    [/^অ্যাকাউন্ট তৈরি হয়েছে। কথনে স্বাগতম, (.+)!$/, 'Account created. Welcome to Kothon, $1!'],
    [/^“(.+)” স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে না।$/, '“$1” will be permanently deleted. This cannot be undone.']
  ];
  function toLatin(s) { return s.replace(/[০-৯]/g, function (d) { return '০১২৩৪৫৬৭৮৯'.indexOf(d); }); }
  /** Translate a Bengali source string (or pattern) when the site is in English */
  function t(s) {
    if (lang !== 'en' || typeof s !== 'string' || !s) { return s; }
    if (Object.prototype.hasOwnProperty.call(EN, s)) { return EN[s]; }
    var l = toLatin(s);
    for (var i = 0; i < EN_RE.length; i++) { if (EN_RE[i][0].test(l)) { return l.replace(EN_RE[i][0], EN_RE[i][1]); } }
    return s;
  }
  var textOrig = new WeakMap(), attrOrig = new WeakMap();
  var I18N_ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-placeholder'];
  /** Translate (or restore) static text nodes and attributes under root */
  function applyLang(root) {
    root = root || document.body;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) { return /^(SCRIPT|STYLE|NOSCRIPT)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
    });
    var nodes = [];
    while (walker.nextNode()) { nodes.push(walker.currentNode); }
    nodes.forEach(function (n) {
      var orig = textOrig.has(n) ? textOrig.get(n) : n.nodeValue, key = orig.trim();
      if (!key || !Object.prototype.hasOwnProperty.call(EN, key)) { return; }
      textOrig.set(n, orig);
      n.nodeValue = lang === 'en' ? orig.replace(key, function () { return EN[key]; }) : orig;
    });
    $$('[placeholder],[aria-label],[title],[alt],[data-placeholder]', root).forEach(function (el) {
      var rec = attrOrig.get(el) || {};
      I18N_ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) { return; }
        var orig = a in rec ? rec[a] : el.getAttribute(a);
        if (!Object.prototype.hasOwnProperty.call(EN, orig)) { return; }
        rec[a] = orig;
        el.setAttribute(a, lang === 'en' ? EN[orig] : orig);
      });
      attrOrig.set(el, rec);
    });
  }

  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  /** Keeps the header toggle buttons and other JS-set labels in the current language/theme */
  function updateToolButtons() {
    var dark = currentTheme() === 'dark', tb = $('#theme-toggle'), lb = $('#lang-toggle');
    var label = t(dark ? 'দিন মোডে যান' : 'রাত মোডে যান');
    tb.setAttribute('aria-label', label); tb.title = label;
    lb.textContent = lang === 'en' ? 'বাং' : 'EN';
    lb.setAttribute('aria-label', lang === 'en' ? 'বাংলায় দেখুন' : 'Switch to English');
    lb.title = lb.getAttribute('aria-label');
    setMenu($('#main-nav').classList.contains('is-open'));
    $$('[data-toggle-pw]').forEach(function (b) {
      var show = $('#' + b.dataset.togglePw).type === 'text';
      b.textContent = t(show ? 'লুকান' : 'দেখান');
      b.setAttribute('aria-label', t(show ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'));
    });
  }
  function setTheme(th) {
    document.documentElement.setAttribute('data-theme', th);
    try { localStorage.setItem('kothon:theme', th); } catch (e) { /* ignore */ }
    var m = $('meta[name="theme-color"]');
    if (m) { m.setAttribute('content', th === 'dark' ? '#12112b' : '#1b1a4e'); }
    updateToolButtons();
  }
  function refreshWriteLabels() {
    var edit = !!state.write.postId;
    $('#write-title').textContent = t(edit ? 'লেখা সম্পাদনা' : 'নতুন লেখা');
    $('#write-publish').textContent = t(edit ? 'পরিবর্তন সংরক্ষণ করুন' : 'প্রকাশ করুন');
    document.title = t(edit ? 'লেখা সম্পাদনা' : 'নতুন লেখা') + ' — কথন';
    updateTitleCounter(); updateStats(); flushDraft();
  }
  function setLang(l) {
    lang = l;
    document.documentElement.lang = l;
    try { localStorage.setItem('kothon:lang', l); } catch (e) { /* ignore */ }
    applyLang(document.body);
    updateToolButtons();
    if (state.writeActive && state.write) { refreshWriteLabels(); }   // never reset a form being written
    else { state.keepScroll = true; route(); state.keepScroll = false; }
  }

  /* ======================================================================
     2. STORAGE
     ====================================================================== */
  var Store = (function () {
    var ls = null, mem = {};
    try { ls = window.localStorage; ls.setItem('__k', '1'); ls.removeItem('__k'); } catch (e) { ls = null; }
    return {
      available: !!ls,
      get: function (k, fb) {
        try { var raw = ls ? ls.getItem(k) : mem[k]; return raw == null ? fb : JSON.parse(raw); } catch (e) { return fb; }
      },
      set: function (k, v, silent) {
        try { var s = JSON.stringify(v); if (ls) { ls.setItem(k, s); } else { mem[k] = s; } return true; }
        catch (e) {
          if (!silent) { toast('ব্রাউজারের সঞ্চয়স্থান ভরে গেছে। ছবি ছোট করুন বা পুরনো লেখা মুছে ফেলুন।', 'error', 6000); }
          return false;
        }
      },
      remove: function (k) { try { if (ls) { ls.removeItem(k); } else { delete mem[k]; } } catch (e) { /* ignore */ } }
    };
  })();

  /* Talks to the backend (/api/*). Always resolves; never throws. */
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' }, tk = Store.get(K.token, null);
    if (tk) { h.Authorization = 'Bearer ' + tk; }
    return fetch(path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { return { ok: false, status: r.status, error: j.error || 'সংরক্ষণ করা যায়নি।' }; }
          j.ok = true; return j;
        });
      })
      .catch(function () { return { ok: false, status: 0, error: 'সার্ভারের সাথে সংযোগ করা যায়নি। ইন্টারনেট দেখুন।' }; });
  }

  function loadData() {
    var pPosts = api('/api/posts').then(function (r) {
      if (r.ok) { state.posts = r.posts; } else { toast(r.error, 'error', 6000); }
    });
    var pUser = Promise.resolve();
    if (Store.get(K.token, null)) {
      pUser = api('/api/auth').then(function (r) {
        if (r.ok) { state.user = r.user; }
        else if (r.status === 401) { Store.remove(K.token); state.user = null; }
      });
    }
    return Promise.all([pPosts, pUser]);
  }

  /* ======================================================================
     3. SANITIZER & TEXT HELPERS
     ====================================================================== */
  var ALLOWED = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, H2: 1, H3: 1, BLOCKQUOTE: 1, UL: 1, OL: 1, LI: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, MATH: 1, LINK: 1, META: 1, TITLE: 1, HEAD: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1, IMG: 1, VIDEO: 1, AUDIO: 1, CANVAS: 1 };
  var BLOCKS = { P: 1, DIV: 1, UL: 1, OL: 1, H2: 1, H3: 1, BLOCKQUOTE: 1 };

  function hasBlockChild(n) {
    for (var i = 0; i < n.children.length; i++) { if (BLOCKS[n.children[i].tagName.toUpperCase()]) { return true; } }
    return false;
  }
  function copyAlign(src, el) {
    var a = (src.style && src.style.textAlign) || src.getAttribute('align') || '';
    a = a.toLowerCase();
    if (a === 'left' || a === 'center' || a === 'right') { el.style.textAlign = a; }
  }
  function cleanInto(src, dest, doc) {
    Array.prototype.forEach.call(src.childNodes, function (n) {
      if (n.nodeType === 3) { dest.appendChild(doc.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) { return; }
      var tag = n.tagName.toUpperCase();
      if (DROP[tag]) { return; }
      if (tag === 'DIV') {
        if (hasBlockChild(n)) { cleanInto(n, dest, doc); return; }
        tag = 'P';
      }
      if (ALLOWED[tag]) {
        var el = doc.createElement(tag);
        if (tag !== 'BR' && tag !== 'B' && tag !== 'STRONG' && tag !== 'I' && tag !== 'EM' && tag !== 'U') { copyAlign(n, el); }
        if (tag !== 'BR') { cleanInto(n, el, doc); }
        dest.appendChild(el);
      } else {
        cleanInto(n, dest, doc); // unknown tag: keep text, drop the wrapper
      }
    });
  }
  /** Returns safe HTML: only whitelisted tags; the only attribute is text-align. */
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html');
    var out = document.createElement('div');
    cleanInto(doc.body, out, document);
    return out.innerHTML;
  }
  function htmlToText(html) {
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html');
    $$('br', doc.body).forEach(function (b) { b.replaceWith('\n'); });
    $$('p,h2,h3,blockquote,li', doc.body).forEach(function (b) { b.append('\n'); });
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  }

  /* ======================================================================
     4. AUTH
     ====================================================================== */
  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(str)), a = [];
    for (var i = 0; i < s.length; i++) { a.push(s.charCodeAt(i)); }
    return a;
  }
  /** Pure-JS SHA-256 (fallback when crypto.subtle is unavailable). Returns hex. */
  function sha256Fallback(msg) {
    var rr = function (v, a) { return (v >>> a) | (v << (32 - a)); };
    var bytes = utf8Bytes(msg), l = bytes.length, i, j;
    var n = (((l + 8) >> 6) + 1) << 4, words = [];
    for (i = 0; i < n; i++) { words[i] = 0; }
    for (i = 0; i < l; i++) { words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8); }
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[n - 1] = l * 8;
    var H = [], K2 = [], pc = 0, comp = {}, c;
    for (c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (i = 0; i < 313; i += c) { comp[i] = c; }
        if (pc < 8) { H[pc] = (Math.pow(c, 0.5) * 4294967296) | 0; }
        K2[pc++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
      }
    }
    for (j = 0; j < n;) {
      var w = words.slice(j, j += 16), old = H;
      H = H.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = H[0], e = H[4];
        var t1 = H[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + K2[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H);
        H[4] = (H[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) { H[i] = (H[i] + old[i]) | 0; }
    }
    var hex = '';
    for (i = 0; i < 8; i++) { for (j = 3; j + 1; j--) { var b = (H[i] >> (j * 8)) & 255; hex += (b < 16 ? '0' : '') + b.toString(16); } }
    return hex;
  }
  function hashPassword(pw, salt) {
    var data = salt + ':' + pw;
    try {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)).then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        }).catch(function () { return sha256Fallback(data); });
      }
    } catch (e) { /* use fallback */ }
    return Promise.resolve(sha256Fallback(data));
  }
  function makeSalt() {
    try { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    catch (e) { return uid() + uid(); }
  }
  function validateUsername(u) {
    var len = Array.from(u).length;
    if (!u) { return 'ইউজারনেম দিন।'; }
    if (len < 3 || len > 24) { return 'ইউজারনেম ৩ থেকে ২৪ অক্ষরের হতে হবে।'; }
    if (!/^[\p{L}\p{M}\p{N}._-]+$/u.test(u)) { return 'ইউজারনেমে শুধু অক্ষর, সংখ্যা, ডট (.), আন্ডারস্কোর (_) ও হাইফেন (-) চলবে।'; }
    return '';
  }
  function register(username, password, password2) {
    username = username.trim();
    var err = validateUsername(username);
    if (err) { return Promise.resolve({ ok: false, error: err }); }
    if (!password) { return Promise.resolve({ ok: false, error: 'পাসওয়ার্ড দিন।' }); }
    if (password.length < 4) { return Promise.resolve({ ok: false, error: 'পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।' }); }
    if (password !== password2) { return Promise.resolve({ ok: false, error: 'দুটি পাসওয়ার্ড মেলেনি।' }); }
    return api('/api/auth', { method: 'POST', body: { action: 'register', username: username, password: password } }).then(function (r) {
      if (r.ok) { startSession(r.user, r.token); }
      return r;
    });
  }
  function login(username, password) {
    username = username.trim();
    if (!username || !password) { return Promise.resolve({ ok: false, error: 'ইউজারনেম ও পাসওয়ার্ড দুটোই দিন।' }); }
    return api('/api/auth', { method: 'POST', body: { action: 'login', username: username, password: password } }).then(function (r) {
      if (r.ok) { startSession(r.user, r.token); }
      return r;
    });
  }
  function startSession(user, token) { state.user = user; Store.set(K.token, token, true); updateNav(); }
  function endSession() { state.user = null; Store.remove(K.token); updateNav(); }

  function updateNav() {
    var u = state.user;
    $('#nav-guest').hidden = !!u;
    $('#nav-user').hidden = !u;
    $('#nav-username').textContent = u ? u.username : '';
  }

  /* ======================================================================
     5. DATA LAYER (ownership enforced here, not only in the UI)
     ====================================================================== */
  function getPost(id) { return state.posts.filter(function (p) { return p.id === id; })[0] || null; }
  function canModify(post) { return !!(state.user && post && post.authorId === state.user.id); }
  function fieldsOf(f) { return { title: f.title, category: f.category, body: f.body, text: f.text, cover: f.cover || '', video: f.video || '' }; }

  function createPost(f) {
    if (!state.user) { return Promise.resolve({ ok: false, error: 'লেখা প্রকাশ করতে লগইন করুন।' }); }
    return api('/api/posts', { method: 'POST', body: fieldsOf(f) }).then(function (r) {
      if (r.ok) { state.posts.unshift(r.post); }
      return r;
    });
  }
  function updatePost(id, f) {
    var post = getPost(id);
    if (!post) { return Promise.resolve({ ok: false, error: 'লেখাটি পাওয়া যায়নি।' }); }
    if (!canModify(post)) { return Promise.resolve({ ok: false, error: 'অন্যের লেখা সম্পাদনা করা যায় না।' }); }
    return api('/api/posts?id=' + encodeURIComponent(id), { method: 'PUT', body: fieldsOf(f) }).then(function (r) {
      if (r.ok) { state.posts[state.posts.indexOf(post)] = r.post; }
      return r;
    });
  }
  function deletePost(id) {
    var post = getPost(id);
    if (!post) { return Promise.resolve({ ok: false, error: 'লেখাটি পাওয়া যায়নি।' }); }
    if (!canModify(post)) { return Promise.resolve({ ok: false, error: 'অন্যের লেখা মুছে ফেলা যায় না।' }); }
    return api('/api/posts?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function (r) {
      if (r.ok) { state.posts.splice(state.posts.indexOf(post), 1); Store.remove(draftKey(id)); }
      return r;
    });
  }

  /* ======================================================================
     6. UI HELPERS (toast, modal, menu)
     ====================================================================== */
  function toast(msg, type, ms) {
    var area = $('#toast-area');
    if (!area) { return; }
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
    el.textContent = t(msg);
    area.appendChild(el);
    while (area.children.length > 4) { area.removeChild(area.firstChild); }
    function leave() {
      if (!el.parentNode) { return; }
      el.classList.add('is-leaving');
      el.addEventListener('animationend', function () { if (el.parentNode) { el.parentNode.removeChild(el); } });
      setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 400);
    }
    setTimeout(leave, ms || 3500);
  }

  function confirmDialog(opts) {
    if (state.modalOpen) { return Promise.resolve(false); }
    state.modalOpen = true;
    return new Promise(function (resolve) {
      var back = $('#modal-backdrop'), ok = $('#modal-confirm'), cancel = $('#modal-cancel'), prev = document.activeElement;
      $('#modal-title').textContent = t(opts.title);
      $('#modal-text').textContent = t(opts.text);
      ok.textContent = t(opts.confirmLabel || 'নিশ্চিত করুন');
      cancel.textContent = t(opts.cancelLabel || 'বাতিল');
      back.hidden = false;
      document.body.classList.add('modal-open');
      function close(v) {
        back.hidden = true;
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', onKey, true);
        ok.onclick = cancel.onclick = back.onmousedown = null;
        state.modalOpen = false;
        if (prev && prev.focus) { prev.focus(); }
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        else if (e.key === 'Tab') {
          var order = [cancel, ok], i = order.indexOf(document.activeElement);
          e.preventDefault();
          order[(i + (e.shiftKey ? -1 : 1) + 2) % 2].focus();
        }
      }
      ok.onclick = function () { close(true); };
      cancel.onclick = function () { close(false); };
      back.onmousedown = function (e) { if (e.target === back) { close(false); } };
      document.addEventListener('keydown', onKey, true);
      cancel.focus();
    });
  }

  function setMenu(open) {
    var nav = $('#main-nav'), btn = $('#menu-toggle');
    nav.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', t(open ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'));
  }
  function closeMenu() { setMenu(false); }

  /* ======================================================================
     7. ROUTER
     ====================================================================== */
  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, '');
    var parts = raw.split('/').map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    var name = parts[0] || 'home', arg = parts[1] || '';
    var ok = { home: 1, about: 1, login: 1, my: 1, write: 1, cat: 1, post: 1 };
    if (!ok[name]) { return { name: 'notfound', arg: '' }; }
    if ((name === 'cat' || name === 'post') && !arg) { return { name: 'notfound', arg: '' }; }
    return { name: name, arg: arg };
  }
  function showPage(id, title) {
    $$('.page').forEach(function (p) { p.hidden = p.id !== id; });
    var el = $('#' + id);
    el.classList.remove('is-entering');
    void el.offsetWidth;
    el.classList.add('is-entering');
    document.title = title ? t(title) + ' — কথন' : (lang === 'en' ? 'Kothon — a community for writers' : 'কথন — লেখার কমিউনিটি');
    if (!state.keepScroll) { window.scrollTo(0, 0); }
    closeMenu();
    $('#main').focus({ preventScroll: true });
  }
  function updateNavActive(r) {
    $$('[data-route]').forEach(function (a) {
      var on = a.dataset.route === r.name && (r.name !== 'cat' || a.dataset.cat === r.arg);
      a.classList.toggle('is-active', on);
      if (on) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
    });
  }

  function route() {
    var r = parseHash();
    state.writeActive = false;
    clearTimeout(state.draftTimer);
    if (!state.user && (r.name === 'write' || r.name === 'my')) {
      state.returnTo = location.hash;
      toast('এই পাতা দেখতে আগে লগইন করুন।', 'info');
      return redirect('#login');
    }
    if (state.user && r.name === 'login') { return redirect('#home'); }
    state.route = r;
    state.currentHash = location.hash || '#home';
    updateNavActive(r);
    switch (r.name) {
      case 'home': return viewHome();
      case 'about': return viewAbout();
      case 'cat': return viewCategory(r.arg);
      case 'login': return viewLogin();
      case 'post': return viewPost(r.arg);
      case 'write': return viewWrite(r.arg);
      case 'my': return viewMy();
      default: return viewNotFound();
    }
  }

  function onHashChange() {
    if (state.writeActive && isDirty() && !state.skipGuard) {
      var next = location.hash;
      history.replaceState(null, '', state.currentHash); // stay on the editor while asking
      confirmDialog({
        title: 'পাতা ছেড়ে যাবেন?',
        text: 'আপনার অসংরক্ষিত পরিবর্তন আছে। ড্রাফট হিসেবে সংরক্ষিত থাকবে, পরে আবার এসে চালিয়ে যেতে পারবেন।',
        confirmLabel: 'ছেড়ে যান', cancelLabel: 'থাকুন'
      }).then(function (ok) {
        if (!ok) { return; }
        flushDraft();
        state.skipGuard = true;
        location.hash = next;
      });
      return;
    }
    state.skipGuard = false;
    if (state.writeActive) { flushDraft(); }
    route();
  }

  /* ======================================================================
     8. VIEWS
     ====================================================================== */
  function catOf(key) { return CATS[key] || null; }

  function buildCard(post, opts) {
    var card = $('#tpl-post-card').content.firstElementChild.cloneNode(true);
    var href = '#post/' + post.id, c = catOf(post.category);
    card.dataset.cat = post.category;
    var cover = $('.card-cover', card);
    if (post.cover) { cover.hidden = false; cover.href = href; $('img', cover).src = post.cover; }
    var tag = $('.card-tag', card);
    tag.textContent = c ? t(c.bn) : post.category;
    tag.href = '#cat/' + post.category;
    var link = $('.card-link', card);
    link.textContent = post.title;
    link.href = href;
    $('.card-excerpt', card).textContent = (post.text || '').slice(0, 200);
    $('.card-author', card).textContent = post.authorName;
    $('.card-date', card).textContent = formatDate(post.createdAt);
    if (post.updatedAt) { $('.card-edited', card).hidden = false; $('.card-edited', card).title = formatDate(post.updatedAt); }
    if (opts && opts.manage && canModify(post)) {
      $('.card-actions', card).hidden = false;
      $('.card-edit', card).href = '#write/' + post.id;
      $('.card-delete', card).dataset.id = post.id;
    }
    if (lang === 'en') { applyLang(card); }
    return card;
  }

  /** Paged ("Load more") list renderer */
  function createListView(cfg) {
    var page = 1, items = [];
    function draw(append) {
      var shown = Math.min(items.length, page * PER_PAGE);
      var from = append ? cfg.list.children.length : 0;
      if (!append) { cfg.list.textContent = ''; }
      var frag = document.createDocumentFragment();
      for (var i = from; i < shown; i++) { frag.appendChild(buildCard(items[i], { manage: cfg.manage })); }
      cfg.list.appendChild(frag);
      cfg.empty.hidden = items.length > 0;
      if (cfg.more) { cfg.more.hidden = shown >= items.length; }
    }
    return {
      set: function (arr) { items = arr; page = 1; draw(false); },
      more: function () { page++; draw(true); }
    };
  }
  function queryPosts(list, q, sort) {
    q = (q || '').trim().toLowerCase();
    var out = list.filter(function (p) {
      return !q || p.title.toLowerCase().indexOf(q) > -1 || p.authorName.toLowerCase().indexOf(q) > -1 || (p.text || '').toLowerCase().indexOf(q) > -1;
    });
    out.sort(function (a, b) { return sort === 'oldest' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt; });
    return out;
  }

  var homeList, catList, myList;

  /* ----- Home ----- */
  function refreshHome() {
    var q = $('#home-search').value, f = $('#home-filter').value, s = $('#home-sort').value;
    var base = state.posts.filter(function (p) { return f === 'all' || p.category === f; });
    var items = queryPosts(base, q, s);
    homeList.set(items);
    $('#home-info').textContent = items.length
      ? ((q.trim() || f !== 'all') ? t(bn(items.length) + ' টি ফলাফল পাওয়া গেছে') : t('মোট ' + bn(items.length) + ' টি লেখা'))
      : '';
  }
  function viewHome() {
    showPage('page-home', '');
    Object.keys(CATS).forEach(function (k) {
      var n = state.posts.filter(function (p) { return p.category === k; }).length;
      $('[data-count="' + k + '"]').textContent = t(bn(n) + ' টি লেখা');
    });
    refreshHome();
  }

  /* ----- Category ----- */
  function refreshCat() {
    var key = state.route.arg, q = $('#cat-search').value;
    var items = queryPosts(state.posts.filter(function (p) { return p.category === key; }), q, $('#cat-sort').value);
    catList.set(items);
    $('#cat-info').textContent = items.length ? t(bn(items.length) + ' টি লেখা') : '';
    $('#cat-empty-title').textContent = t(q.trim() ? 'কোনো ফলাফল পাওয়া যায়নি' : 'এই বিভাগে এখনও কোনো লেখা নেই');
  }
  function viewCategory(key) {
    var c = catOf(key);
    if (!c) { return viewNotFound(); }
    if (state.catKey !== key) { $('#cat-search').value = ''; $('#cat-sort').value = 'newest'; state.catKey = key; }
    showPage('page-category', c.bn);  // showPage() translates the title
    $('#cat-head').dataset.cat = key;
    $('#cat-title').textContent = lang === 'en' ? c.en : c.bn + ' · ' + c.en;
    $('#cat-lead').textContent = t(c.lead);
    refreshCat();
  }

  /* ----- About / 404 ----- */
  function viewAbout() { showPage('page-about', 'আমাদের কথা'); }
  function viewNotFound() { showPage('page-notfound', 'পাতা পাওয়া যায়নি'); }

  /* ----- Login / Register ----- */
  function setAuthTab(name) {
    ['login', 'register'].forEach(function (t) {
      var on = t === name, tab = $('#tab-' + t), panel = $('#panel-' + t);
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
      panel.classList.remove('is-entering');
    });
  }
  function showFormError(id, msg) { var el = $('#' + id); el.textContent = t(msg || ''); el.hidden = !msg; }
  function afterAuth(msg) {
    toast(msg, 'success');
    var dest = state.returnTo || '#home';
    state.returnTo = '';
    go(dest);
  }
  function viewLogin() {
    showPage('page-login', 'লগইন / নিবন্ধন');
    showFormError('login-error', ''); showFormError('register-error', '');
    setAuthTab('login');
  }

  /* ----- Single post ----- */
  function buildVideoEl(value) {
    var v = parseVideo(value);
    if (!v) { return null; }
    var el;
    if (v.type === 'youtube') {
      el = document.createElement('iframe');
      el.src = 'https://www.youtube-nocookie.com/embed/' + v.id;
      el.title = 'ভিডিও';
      el.loading = 'lazy';
      el.allowFullscreen = true;
      el.setAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen');
      el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    } else {
      el = document.createElement('video');
      el.controls = true; el.preload = 'metadata'; el.src = v.url;
    }
    return el;
  }
  function parseVideo(url) {
    url = (url || '').trim();
    if (!url) { return null; }
    var m = url.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i);
    if (m) { return { type: 'youtube', id: m[1] }; }
    if (/^https?:\/\/[^\s]+\.(mp4|webm)(\?[^\s]*)?(#[^\s]*)?$/i.test(url)) { return { type: 'file', url: url }; }
    return null;
  }
  function viewPost(id) {
    var post = getPost(id);
    if (!post) { return viewNotFound(); }
    state.currentPostId = id;
    var c = catOf(post.category);
    showPage('page-post', post.title);
    $('#post-view').dataset.cat = post.category;
    var tag = $('#post-tag');
    tag.textContent = c ? t(c.bn) : post.category;
    tag.href = '#cat/' + post.category;
    tag.dataset.cat = post.category;
    $('#post-back').href = '#cat/' + post.category;
    $('#post-title').textContent = post.title;
    $('#post-author').textContent = post.authorName;
    $('#post-date').textContent = formatDate(post.createdAt);
    var ed = $('#post-edited');
    ed.hidden = !post.updatedAt;
    ed.textContent = post.updatedAt ? t('সম্পাদিত: ' + formatDate(post.updatedAt)) : '';
    var mins = readMinutes(countWords(post.text));
    $('#post-read').textContent = mins ? t('পড়তে প্রায় ' + bn(mins) + ' মিনিট') : '';
    var cover = $('#post-cover');
    cover.hidden = !post.cover;
    if (post.cover) { $('#post-cover-img').src = post.cover; $('#post-cover-img').alt = post.title; }
    var vbox = $('#post-video');
    vbox.textContent = '';
    var vel = post.video ? buildVideoEl(post.video) : null;
    vbox.hidden = !vel;
    if (vel) { vbox.appendChild(vel); }
    $('#post-body').innerHTML = sanitize(post.body);
    var own = canModify(post);
    $('#post-owner-actions').hidden = !own;
    if (own) { $('#post-edit-link').href = '#write/' + post.id; }
  }

  /* ----- My posts ----- */
  function viewMy() {
    showPage('page-my', 'আমার লেখা');
    var mine = state.posts.filter(function (p) { return p.authorId === state.user.id; });
    mine.sort(function (a, b) { return b.createdAt - a.createdAt; });
    $('#my-count').textContent = t(mine.length ? 'আপনার মোট ' + bn(mine.length) + ' টি লেখা আছে।' : 'এখানে আপনার সব লেখা দেখা যাবে।');
    myList.set(mine);
  }

  async function handleDelete(id) {
    var post = getPost(id);
    if (!post) { return; }
    var ok = await confirmDialog({ title: 'লেখাটি মুছে ফেলবেন?', text: '“' + post.title + '” স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে না।', confirmLabel: 'মুছে ফেলুন' });
    if (!ok) { return; }
    var res = await deletePost(id);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('লেখাটি মুছে ফেলা হয়েছে।', 'success');
    if (state.route.name === 'post') { go('#my'); } else { route(); }
  }

  /* ======================================================================
     9. EDITOR (write / edit page)
     ====================================================================== */
  function draftKey(postId) { return K.draft + (state.user ? state.user.id : 'x') + ':' + (postId || 'new'); }
  function editorEl() { return $('#editor'); }
  function editorHasText() { return editorEl().textContent.trim().length > 0; }
  function getFormData() {
    return {
      title: $('#post-title-input').value.trim(),
      category: $('#post-category').value,
      body: editorHasText() ? editorEl().innerHTML : '',
      cover: state.write.cover,
      video: state.write.video
    };
  }
  function snapshot() { return JSON.stringify(getFormData()); }
  function isDirty() { return !!(state.writeActive && state.write && snapshot() !== state.write.baseline); }

  function updateTitleCounter() {
    var n = Array.from($('#post-title-input').value).length, el = $('#title-counter');
    el.textContent = bn(n) + ' / ' + bn(TITLE_MAX);
    el.classList.toggle('is-warn', n >= TITLE_MAX - 10);
  }
  function updateStats() {
    var w = countWords(editorEl().innerText), m = readMinutes(w);
    $('#editor-stats').textContent = t(bn(w) + ' শব্দ · পড়তে ' + (m ? 'প্রায় ' : '') + bn(m) + ' মিনিট');
  }
  function updateToolbarState() {
    var sel = window.getSelection();
    if (!sel.rangeCount || !editorEl().contains(sel.anchorNode)) { return; }
    $$('.tb[data-cmd]').forEach(function (b) {
      var cmd = b.dataset.cmd, on = false;
      try {
        if (cmd === 'formatBlock') { on = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '') === b.dataset.val; }
        else if (cmd !== 'undo' && cmd !== 'redo' && cmd !== 'removeFormat') { on = document.queryCommandState(cmd); }
      } catch (e) { on = false; }
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function flushDraft() {
    clearTimeout(state.draftTimer);
    if (!state.user || !state.writeActive || !state.write) { return; }
    var key = draftKey(state.write.postId), status = $('#draft-status');
    if (!isDirty()) { Store.remove(key); status.textContent = ''; return; }
    var d = getFormData();
    d.savedAt = Date.now();
    status.textContent = t(Store.set(key, d, true)
      ? 'ড্রাফট সংরক্ষিত — ' + formatTime(d.savedAt)
      : 'ড্রাফট সংরক্ষণ করা যায়নি (জায়গা শেষ)। ছবি ছোট করুন।');
  }
  function scheduleDraft() { clearTimeout(state.draftTimer); state.draftTimer = setTimeout(flushDraft, 700); }

  function setCover(dataUrl) {
    state.write.cover = dataUrl || '';
    $('#cover-preview').hidden = !dataUrl;
    $('#cover-drop').hidden = !!dataUrl;
    $('#cover-preview-img').src = dataUrl || '';
  }
  function setVideo(value, showErrors) {
    var box = $('#video-preview'), raw = value.trim();
    box.textContent = '';
    state.write.video = '';
    if (!raw) { box.hidden = true; showFormError('video-error', ''); return; }
    var el = buildVideoEl(raw);
    if (!el) {
      box.hidden = true;
      if (showErrors) { showFormError('video-error', 'সঠিক YouTube লিংক অথবা .mp4 / .webm ফাইলের লিংক দিন।'); }
      return;
    }
    showFormError('video-error', '');
    state.write.video = raw;
    box.appendChild(el);
    box.hidden = false;
  }

  function applyForm(d) {
    $('#post-title-input').value = d.title || '';
    $('#post-category').value = catOf(d.category) ? d.category : 'poetry';
    editorEl().innerHTML = d.body ? sanitize(d.body) : '<p><br></p>';
    syncEmpty();
    setCover(d.cover || '');
    $('#video-input').value = d.video || '';
    setVideo(d.video || '', false);
    updateTitleCounter(); updateStats();
  }

  function viewWrite(id) {
    var post = null;
    if (id) {
      post = getPost(id);
      if (!post) { return viewNotFound(); }
      if (!canModify(post)) { toast('অন্যের লেখা সম্পাদনা করা যায় না।', 'error'); return redirect('#my'); }
    }
    showPage('page-write', post ? 'লেখা সম্পাদনা' : 'নতুন লেখা');
    state.write = { postId: id || '', cover: '', video: '', baseline: '' };
    $('#write-title').textContent = t(post ? 'লেখা সম্পাদনা' : 'নতুন লেখা');
    $('#write-publish').textContent = t(post ? 'পরিবর্তন সংরক্ষণ করুন' : 'প্রকাশ করুন');
    ['title-error', 'body-error', 'cover-error', 'video-error'].forEach(function (e) { showFormError(e, ''); });
    $('#draft-status').textContent = '';
    applyForm(post ? { title: post.title, category: post.category, body: post.body, cover: post.cover, video: post.video } : {});
    state.write.baseline = snapshot();
    state.writeActive = true;
    var draft = Store.get(draftKey(id), null);
    if (draft && (draft.title || draft.body || draft.cover || draft.video)) {
      applyForm(draft);
      if (isDirty()) { toast('আগের অসম্পূর্ণ ড্রাফট ফিরিয়ে আনা হয়েছে।', 'info'); }
    }
    document.execCommand('defaultParagraphSeparator', false, 'p');
    $('#post-title-input').focus({ preventScroll: true });
  }

  /** Resize + compress an image file client-side; resolves to a JPEG data URL */
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var maxW = 1400, q = 0.8, out = '';
        for (var attempt = 0; attempt < 5; attempt++) {
          var scale = Math.min(1, maxW / img.naturalWidth);
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
          cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          out = cv.toDataURL('image/jpeg', q);
          if (out.length < 700000) { break; }
          maxW = Math.round(maxW * 0.8); q = Math.max(0.5, q - 0.07);
        }
        resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  function execCmd(cmd, val) {
    var ed = editorEl();
    ed.focus();
    if (state.savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(state.savedRange);
    }
    if (cmd === 'formatBlock') {
      var cur = (document.queryCommandValue('formatBlock') || '').toLowerCase().replace(/[<>]/g, '');
      document.execCommand('formatBlock', false, '<' + (cur === val && val !== 'p' ? 'p' : val) + '>');
    } else {
      document.execCommand(cmd, false, null);
    }
    onEditorInput();
    updateToolbarState();
  }
  /** The editor must always hold a real block, otherwise Chrome shows no caret in an empty contenteditable */
  function resetEditor() {
    var ed = editorEl();
    ed.innerHTML = '<p><br></p>';
    var r = document.createRange(), sel = window.getSelection();
    r.setStart(ed.firstChild, 0); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  function syncEmpty() {
    var ed = editorEl();
    ed.classList.toggle('is-empty', !ed.textContent.trim() && !ed.querySelector('li,blockquote,h2,h3'));
  }
  function onEditorInput() {
    var ed = editorEl();
    if (!ed.firstChild) { resetEditor(); }
    syncEmpty();
    showFormError('body-error', '');
    updateStats();
    scheduleDraft();
  }
  function onPaste(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    text = text.replace(/\r\n?/g, '\n');
    var html = text.split(/\n{2,}/).map(function (para) {
      return '<p>' + escapeHtml(para).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    document.execCommand('insertHTML', false, html);
    onEditorInput();
  }

  async function publish(e) {
    e.preventDefault();
    if (state.saving) { return; }
    var d = getFormData(), bad = null;
    ['title-error', 'body-error', 'cover-error'].forEach(function (x) { showFormError(x, ''); });
    if (!d.title) { showFormError('title-error', 'শিরোনাম লিখুন।'); bad = bad || $('#post-title-input'); }
    if (!d.body) { showFormError('body-error', 'লেখার অংশ খালি রাখা যাবে না।'); bad = bad || editorEl(); }
    if ($('#video-input').value.trim() && !state.write.video) {
      showFormError('video-error', 'সঠিক YouTube লিংক অথবা .mp4 / .webm ফাইলের লিংক দিন।'); bad = bad || $('#video-input');
    }
    if (bad) { toast('অনুগ্রহ করে লাল চিহ্নিত ত্রুটিগুলো ঠিক করুন।', 'error'); bad.focus(); return; }
    var body = sanitize(d.body);
    var fields = { title: d.title, category: d.category, body: body, text: htmlToText(body), cover: d.cover, video: d.video };
    state.saving = true;
    var res = await (state.write.postId ? updatePost(state.write.postId, fields) : createPost(fields));
    state.saving = false;
    if (!res.ok) { toast(res.error, 'error'); return; }
    var wasEdit = !!state.write.postId;
    Store.remove(draftKey(state.write.postId));
    state.write.baseline = snapshot();
    state.writeActive = false;
    toast(wasEdit ? 'পরিবর্তন সংরক্ষিত হয়েছে।' : 'লেখাটি প্রকাশিত হয়েছে।', 'success');
    go('#post/' + res.post.id);
  }

  async function cancelWrite() {
    if (isDirty()) {
      var ok = await confirmDialog({
        title: 'লেখা বাতিল করবেন?', text: 'অসংরক্ষিত পরিবর্তন ও ড্রাফট মুছে যাবে।',
        confirmLabel: 'বাতিল করুন', cancelLabel: 'লিখতে থাকুন'
      });
      if (!ok) { return; }
    }
    Store.remove(draftKey(state.write.postId));
    state.write.baseline = snapshot();
    state.writeActive = false;
    go(state.write.postId ? '#post/' + state.write.postId : '#my');
  }

  /* ======================================================================
     10. INIT & EVENT WIRING
     ====================================================================== */
  function bindEvents() {
    /* header / menu */
    $('#menu-toggle').addEventListener('click', function () { setMenu(!$('#main-nav').classList.contains('is-open')); });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#main-nav') && !e.target.closest('#menu-toggle')) { closeMenu(); }
      var del = e.target.closest('.card-delete');
      if (del) { handleDelete(del.dataset.id); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMenu(); } });
    $('#main-nav').addEventListener('click', function (e) { if (e.target.closest('a')) { closeMenu(); } });
    $('#btn-logout').addEventListener('click', async function () {
      if (state.writeActive && isDirty()) {
        var ok = await confirmDialog({ title: 'লগআউট করবেন?', text: 'আপনার অসংরক্ষিত লেখা ড্রাফট হিসেবে সংরক্ষিত থাকবে।', confirmLabel: 'লগআউট', cancelLabel: 'থাকুন' });
        if (!ok) { return; }
        flushDraft();
      }
      state.writeActive = false;
      endSession();
      toast('আপনি লগআউট করেছেন।', 'success');
      go('#home');
    });

    /* lists */
    homeList = createListView({ list: $('#home-list'), empty: $('#home-empty'), more: $('#home-more') });
    catList = createListView({ list: $('#cat-list'), empty: $('#cat-empty'), more: $('#cat-more') });
    myList = createListView({ list: $('#my-list'), empty: $('#my-empty'), manage: true });
    $('#home-more').addEventListener('click', function () { homeList.more(); });
    $('#cat-more').addEventListener('click', function () { catList.more(); });
    $('#home-search').addEventListener('input', debounce(refreshHome, 200));
    $('#home-filter').addEventListener('change', refreshHome);
    $('#home-sort').addEventListener('change', refreshHome);
    $('#cat-search').addEventListener('input', debounce(refreshCat, 200));
    $('#cat-sort').addEventListener('change', refreshCat);

    /* post page */
    $('#post-delete-btn').addEventListener('click', function () { handleDelete(state.currentPostId); });

    /* auth */
    $('#tab-login').addEventListener('click', function () { setAuthTab('login'); });
    $('#tab-register').addEventListener('click', function () { setAuthTab('register'); });
    $$('.tab').forEach(function (t) {
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          var next = t.id === 'tab-login' ? 'register' : 'login';
          setAuthTab(next); $('#tab-' + next).focus();
        }
      });
    });
    $$('[data-switch-tab]').forEach(function (b) { b.addEventListener('click', function () { setAuthTab(b.dataset.switchTab); }); });
    $$('[data-toggle-pw]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = $('#' + b.dataset.togglePw), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.textContent = t(show ? 'লুকান' : 'দেখান');
        b.setAttribute('aria-label', t(show ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান'));
      });
    });
    $$('#panel-login input, #panel-register input').forEach(function (i) {
      i.addEventListener('input', function () { showFormError('login-error', ''); showFormError('register-error', ''); });
    });
    $('#panel-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#login-submit'); btn.disabled = true;
      login($('#login-username').value, $('#login-password').value).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { showFormError('login-error', r.error); return; }
        $('#login-password').value = '';
        afterAuth('স্বাগতম, ' + r.user.username + '!');
      });
    });
    $('#panel-register').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('#register-submit'); btn.disabled = true;
      register($('#reg-username').value, $('#reg-password').value, $('#reg-password2').value).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { showFormError('register-error', r.error); return; }
        $('#reg-password').value = ''; $('#reg-password2').value = '';
        afterAuth('অ্যাকাউন্ট তৈরি হয়েছে। কথনে স্বাগতম, ' + r.user.username + '!');
      });
    });

    /* editor */
    var ed = editorEl();
    $('#post-title-input').addEventListener('input', function () { updateTitleCounter(); showFormError('title-error', ''); scheduleDraft(); });
    $('#post-category').addEventListener('change', scheduleDraft);
    ed.addEventListener('input', onEditorInput);
    ed.addEventListener('paste', onPaste);
    ed.addEventListener('keyup', updateToolbarState);
    ed.addEventListener('mouseup', updateToolbarState);
    document.addEventListener('selectionchange', function () {
      var sel = window.getSelection();
      if (sel.rangeCount && ed.contains(sel.anchorNode)) { state.savedRange = sel.getRangeAt(0).cloneRange(); updateToolbarState(); }
    });
    $$('.tb').forEach(function (b) {
      b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep text selection
      b.addEventListener('click', function () { execCmd(b.dataset.cmd, b.dataset.val); });
    });
    $('#cover-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) { return; }
      showFormError('cover-error', '');
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) { showFormError('cover-error', 'শুধু PNG, JPG, WebP বা GIF ছবি দিন।'); return; }
      if (f.size > 15 * 1024 * 1024) { showFormError('cover-error', 'ছবিটি অনেক বড় (সর্বোচ্চ ১৫ MB)।'); return; }
      compressImage(f).then(function (url) { setCover(url); scheduleDraft(); toast('কভার ছবি যোগ হয়েছে।', 'success'); })
        .catch(function () { showFormError('cover-error', 'ছবিটি পড়া যায়নি। অন্য ছবি চেষ্টা করুন।'); });
    });
    $('#cover-remove').addEventListener('click', function () { setCover(''); scheduleDraft(); toast('কভার ছবি সরানো হয়েছে।', 'info'); });
    $('#video-input').addEventListener('input', debounce(function () { setVideo($('#video-input').value, true); scheduleDraft(); }, 350));
    $('#write-form').addEventListener('submit', publish);
    $('#write-cancel').addEventListener('click', cancelWrite);

    /* day / night and language toggles */
    $('#theme-toggle').addEventListener('click', function () { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); });
    $('#lang-toggle').addEventListener('click', function () { setLang(lang === 'en' ? 'bn' : 'en'); });

    /* routing, unload, cross-tab sync */
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', function (e) {
      if (state.writeActive) { flushDraft(); }
      if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function init() {
    lang = document.documentElement.lang === 'en' ? 'en' : 'bn';
    updateNav();
    $('#footer-year').textContent = bn(new Date().getFullYear());
    bindEvents();
    if (!Store.available) { toast('লোকাল স্টোরেজ বন্ধ আছে — পাতা বন্ধ করলে লেখা হারিয়ে যাবে।', 'error', 7000); }
    if (!location.hash) { history.replaceState(null, '', '#home'); }
    updateToolButtons();
    loadData().then(function () {
      updateNav();
      route();
      if (lang === 'en') { applyLang(document.body); }
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
