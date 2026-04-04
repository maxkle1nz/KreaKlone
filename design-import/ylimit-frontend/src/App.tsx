import { Router as WouterRouter, Switch, Route } from "wouter";
import { Studio } from "@/pages/Studio";

function NotFound() {
  return (
    <div className="yl-not-found">
      <h1>404</h1>
      <p>Page not found</p>
    </div>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Switch>
        <Route path="/" component={Studio} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
