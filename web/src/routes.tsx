import { Route, Switch } from "wouter-preact";
import Home from "./pages/home";
import ConnectToInstance from "./pages/connect";
import CreateSchedule from "./pages/create-schedule";
import Schedule from "./pages/schedule";

export default function Routers() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/instances/:id/connect" component={ConnectToInstance} />
      <Route path="/schedules" nest>
        <Switch>
          <Route path="/create" component={CreateSchedule} />
          <Route path="/:id" component={Schedule} />
        </Switch>
      </Route>
    </Switch>
  )
}
