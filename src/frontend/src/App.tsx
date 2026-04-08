import RonaldoGame from "./RonaldoGame";

export default function App() {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: "linear-gradient(180deg, #071a07 0%, #030e03 100%)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <RonaldoGame />
    </div>
  );
}
