import React, { createContext, useState, useEffect } from "react";
// We use Route in order to define the different routes of our application
import { Route, Routes } from "react-router-dom";

// We import all the components we need in our app
import Navbar from "./components/navbar";
import LandingPage from "./components/pages/landingPage";
import HomePage from "./components/pages/homePage";
import Login from "./components/pages/loginPage";
import Signup from "./components/pages/registerPage";
import PrivateUserProfile from "./components/pages/privateUserProfilePage";
import ResortsPage from "./components/pages/resortsPage";
import ResortDetailPage from "./components/pages/resortDetailPage";
import AdminReportsPage from "./components/pages/adminReportsPage";
import getUserInfo from "./utilities/decodeJwt";

export const UserContext = createContext();
const App = () => {
  const [user, setUser] = useState();

  useEffect(() => {
    setUser(getUserInfo());
  }, []);

  return (
    <>
      <Navbar />
      <UserContext.Provider value={user}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/resorts" element={<ResortsPage />} />
          {/* One dynamic route serves a page for every resort in the catalog */}
          <Route path="/resorts/:slug" element={<ResortDetailPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/privateUserProfile" element={<PrivateUserProfile />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
        </Routes>
      </UserContext.Provider>
    </>
  );
};



export default App
