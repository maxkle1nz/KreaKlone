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

export default function App() {
  return (
    <WouterRouter>
      <Switch>
        <Route path="/" component={Studio} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}
