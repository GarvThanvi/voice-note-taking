import Features from "../components/LandingPage/Features";
import KeyboardMinimal from "../components/LandingPage/KeyboardMinimal";
import Shortcuts from "../components/LandingPage/Shortcuts";
import SimplifyNotes from "../components/LandingPage/SimplifyNotes";
import SubscribeMail from "../components/LandingPage/SubscribeMail";

const LandingPage = () => {
  return (
    <div>
      <Features></Features>
      <Shortcuts></Shortcuts>
      <KeyboardMinimal></KeyboardMinimal>
      <SimplifyNotes></SimplifyNotes>
      <SubscribeMail></SubscribeMail>
    </div>
  );
};

export default LandingPage;
