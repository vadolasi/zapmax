import { Route, Switch } from "wouter-preact";
import Home from "./pages/home";
import ConnectToInstance from "./pages/connect";
import Instance from "./pages/instance";

export default function Routers() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/:id" nest>
        <Route path="/" component={Instance} />
        <Route path="/connect" component={ConnectToInstance} />
      </Route>
    </Switch>
  )
}
