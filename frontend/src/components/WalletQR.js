// frontend/src/components/WalletQR.js
import React from "react";

const WalletQR = ({ address }) => {
  return (
    <div>
      <h2>Escanea el código QR para realizar el pago</h2>
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?data=${address}&size=150x150`}
        alt="QR Code"
      />
    </div>
  );
};

export default WalletQR;