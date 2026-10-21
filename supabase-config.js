// UniSkilled — the ONE place the website's database address and public key live.
// Every page loads this file before its own scripts and reads USK_CONFIG.url / USK_CONFIG.anonKey.
//
// The anon key is public by design: it only lets visitors do what the database's access rules
// (RLS) allow. To rotate it, or switch to a Supabase "publishable" key, change it here only.
window.USK_CONFIG = Object.freeze({
  url: 'https://orghkbbohnabcietidiv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZ2hrYmJvaG5hYmNpZXRpZGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMzcwMTMsImV4cCI6MjA5MjcxMzAxM30.3bOnZuga8a4xY4mbKdgLnw6EwAV5UuQDz26JI_vM-u8',
});
