import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBvrQxlx5JB-rDBLMKw-1oAqyxQs-VuhcU",
  authDomain: "incubator-6ae5e.firebaseapp.com",
  databaseURL: "https://incubator-6ae5e-default-rtdb.firebaseio.com",
  projectId: "incubator-6ae5e",
  storageBucket: "incubator-6ae5e.firebasestorage.app",
  messagingSenderId: "847985566723",
  appId: "1:847985566723:web:cfde81aede8dbb62ad5a36",
  measurementId: "G-CJMJP30RJ1"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
