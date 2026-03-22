import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login             from "./pages/Login";
import Register          from "./pages/Register";
import Home              from "./pages/Home";
import Dashboard         from "./pages/Dashboard";
import Insights          from "./pages/Insights";
import ReceiptScanner    from "./pages/ReceiptScanner";
import RecurringExpenses from "./pages/RecurringExpenses";
import Calendar          from "./pages/Calendar";
import Todos             from "./pages/Todos";
import Reminders         from "./pages/Reminders";
import Profile           from "./pages/Profile";
import BottomNav         from "./components/BottomNav";
import "./App.css";

function PrivateRoute({ children }) {
  return localStorage.getItem("token") ? children : <Navigate to="/" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/home"      element={<PrivateRoute><Home /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/insights"  element={<PrivateRoute><Insights /></PrivateRoute>} />
        <Route path="/receipts"  element={<PrivateRoute><ReceiptScanner /></PrivateRoute>} />
        <Route path="/recurring" element={<PrivateRoute><RecurringExpenses /></PrivateRoute>} />
        <Route path="/calendar"  element={<PrivateRoute><Calendar /></PrivateRoute>} />
        <Route path="/todos"     element={<PrivateRoute><Todos /></PrivateRoute>} />
        <Route path="/reminders" element={<PrivateRoute><Reminders /></PrivateRoute>} />
        <Route path="/profile"   element={<PrivateRoute><Profile /></PrivateRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Mobile bottom navigation — hidden on desktop via CSS */}
      <BottomNav />
    </BrowserRouter>
  );
}

export default App;