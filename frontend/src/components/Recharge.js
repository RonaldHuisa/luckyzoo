// frontend/src/components/Recharge.js
import React, { useState } from "react";

const Recharge = () => {
  const [network, setNetwork] = useState("BEP20-USDT");
  const [depositAddress] = useState("0x5be426e6b6b53a878acb4ad0d31a310f711cc684");
//
  return (
    <div>
      <h1>Recargar fondos</h1>
      <select onChange={(e) => setNetwork(e.target.value)} value={network}>
        <option value="BEP20-USDT">BEP20-USDT</option>
      </select>
      <div>
        <h2>Dirección de depósito</h2>
        <p>{depositAddress}</p>
        <button onClick={() => navigator.clipboard.writeText(depositAddress)}>Copiar dirección</button>
      </div>
      <div>
        <h3>Escanea el código QR para realizar el pago:</h3>
        <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${depositAddress}&size=150x150`} alt="QR Code" />
      </div>
    </div>
  );
};

export default Recharge;