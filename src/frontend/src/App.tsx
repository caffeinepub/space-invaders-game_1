import SpaceInvaders from "./SpaceInvaders";

export default function App() {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: "#000",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SpaceInvaders />
    </div>
  );
}
