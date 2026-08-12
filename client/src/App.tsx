import { BrowserRouter, Route, Routes } from "react-router-dom";
import Index from "./pages";
import NotFound from "./pages/NotFound";

import ROUTES from "./routes";

const App = () => (

  <BrowserRouter>
    {/* 🔐 GLOBAL AUTH STATE */}
    <Routes>
      {/* Public */}
      <Route path={ROUTES.INDEX} element={<Index />} />

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
