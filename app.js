const externalAssets = {
  BTC: {name:"Bitcoin",symbol:"BTC"},
  ETH: {name:"Ethereum",symbol:"ETH"},
  XRP: {name:"Ripple",symbol:"XRP"},
  LTC: {name:"Litecoin",symbol:"LTC"},
  XLM: {name:"Stellar",symbol:"XLM"},
  BCH: {name:"Bitcoin Cash",symbol:"BCH"},
  BSV: {name:"Bitcoin SV",symbol:"BSV"},
  EOS: {name:"EOS",symbol:"EOS"},
  USDT: {name:"Tether",symbol:"USDT"},
  BNB: {name:"Binance Coin",symbol:"BNB"},
  USDC: {name:"USD Coin",symbol:"USDC"},
};

const nativeAssets = {
  NEO:{name:"NEO",symbol:"NEO"},
  GAS:{name:"GAS",symbol:"GAS"},
  ONT:{name:"Ontology",symbol:"ONT"},
  ONG:{name:"Ontology GAS",symbol:"ONG"},
};

var app = new Vue({
  el: '#app',
  data: {
    connectedAddress:"",
    assets: Object.assign({}, externalAssets, nativeAssets),
    availableFromAssets: Object.values(externalAssets),
    toAssetPairs:{
      BTC: Object.values(nativeAssets),
      ETH: Object.values(nativeAssets),
      XRP: [
        nativeAssets.NEO,
        nativeAssets.ONT,
        nativeAssets.ONG,
      ],
      LTC: Object.values(nativeAssets),
      XLM: Object.values(nativeAssets),
      BCH: Object.values(nativeAssets),
      BSV: Object.values(nativeAssets),
      EOS: Object.values(nativeAssets),
      USDT: [
        nativeAssets.NEO,
        nativeAssets.ONT,
        nativeAssets.ONG,
      ],
      BNB: Object.values(nativeAssets),
      USDC: Object.values(nativeAssets),
      NEO: [
        nativeAssets.GAS,
        nativeAssets.ONT,
        nativeAssets.ONG,
        externalAssets.BTC,
        externalAssets.USDC,
        externalAssets.ETH,
      ],
      GAS: [
        nativeAssets.NEO,
        externalAssets.BTC,
        externalAssets.USDC,
        externalAssets.ETH,
      ],
    },
    fromAsset:"BTC",
    toAsset:"NEO",
    fromAmount:1,
    rate:{},
    transaction:null,
    selectFromCurrency:false,
    selectToCurrency:false,
    isLoadingRate:false,
    typingTimer: {},
    doneTypingInterval: 750,
    isCreatingTransaction:false,
    done: false,
    errorMessage:null,
    showQRForMobileSection:false,
    eventSource:null,
    dapiProvider: null,
  },
  computed:{
    fromNativeAsset() {
      return this.fromAsset === "NEO" || this.fromAsset === "GAS";
    },
    toNativeAsset() {
      return Boolean(nativeAssets[this.toAsset]);
    },
    ratePerOne() {
      return this.rate.estimatedAmount / this.fromAmount;
    },
    toAmount() {
      if (
        this.isLoadingRate ||
        this.fromAsset == this.toAsset ||
        this.rate.estimatedAmount == null
      ) {
        return 0;
      }
      return this.rate.estimatedAmount;
    },
    pair() {
      return this.fromAsset + "_" + this.toAsset;
    },
    minAmount() {
      return Number(this.rate.minAmount);
    },
    o3PayAvailable() {
      return this.dapiProvider &&
      this.dapiProvider.compatibility.includes('PAY') &&
      o3dapi.PAY.assets[this.fromAsset];
    },
    availableToAssets() {
      return this.toAssetPairs[this.fromAsset];
    },
    o3PayReceiveAvailable() {
      return this.dapiProvider &&
      this.dapiProvider.compatibility.includes('PAY') &&
      compareVersions('3.0.0', this.dapiProvider.version) !== 1
    }
  },
  watch:{
    connectedAddress(value) {
      this.errorMessage = null;
    },
    fromAmount(value) {
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => {
        if (value === "") {
          return
        }
        this.getRate(this.pair, value);
      }, this.doneTypingInterval);

    },
    toAsset(value) {
      this.getRate(this.pair,this.fromAmount);
      this.selectToCurrency = false;
    },
    fromAsset(value) {
      this.getRate(this.pair, this.fromAmount);
      this.selectFromCurrency = false;
      if (!this.toAssetPairs[this.fromAsset].find(({symbol}) => symbol === this.toAsset)) {
        this.toAsset = this.toAssetPairs[this.fromAsset][0].symbol;
      }
    }
  },
  methods:{
    connectWithO3() {
      if (
        this.toAsset === this.assets.BTC.symbol ||
        this.toAsset === this.assets.USDC.symbol
      ) {
        this.getPayAccount()
      } else {
        this.getAccount();
      }
    },
    madeTransaction() {
      this.done = true;
    },
    trackingLink(transaction) {
      return "https://changenow.io/exchange/txs/" + transaction.id;
    },
    emailBody(transaction) {
      var subject = "Transaction on O3 Swap. Reference ID: " + transaction.id;
      var body = "Sending: " +  this.fromAmount + "" + this.fromAsset + "%0D%0A";
      body = body + "To address: " +  transaction.payinAddress + "%0D%0A";
      body = body + "Will receive: " +  transaction.amount + "" + this.toAsset  + "%0D%0A";
      body = body + "Reference ID: " +  transaction.id + "%0D%0A";
      body = body + "Status: https://changenow.io/exchange/txs/" +  transaction.id + "%0D%0A";
      return "mailto:?body=" + body + "&subject=" + subject;
    },
    selectCurrency(target) {
      if (target == "from") {
        this.selectFromCurrency = !this.selectFromCurrency
      }  else if (target =='to') {
        this.selectToCurrency = !this.selectToCurrency
      }
    },
    resetTransaction() {
      this.done = false;
      this.rate = {};
      this.transaction = null;
      this.getRate(this.pair,this.fromAmount);
    },
    logo(asset) {
      return "assets/coins/" + asset + ".png";
    },
    getRate(pair, amount) {
      if (this.fromAsset == this.toAsset) {
        this.rate = {};
        return
      }
      this.isLoadingRate = true;
      axios.get("https://platform.o3.network/public/api/xchange/rate/" + amount + "/" + pair,  {withCredentials: true, credentials: 'same-origin'})
      .then(response => {
        this.isLoadingRate = false;
        var data = response.data.result.data;
        this.rate = data;
      })
    },
    copyAddress(field) {
      var copyText = document.getElementById(field);
      copyText.select();
      document.execCommand("copy");
      alert("Copied " + this.transaction.payinAddress + " to clipboard.")
    },
    renderQR(text) {
      var qrcode = new QRCode(document.getElementById("toAddressQR"), {
        text: text,
        width: 128,
        height: 128,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
      });
    },
    send(){
      var toAddress = this.transaction.payinAddress;
      var asset = this.transaction.fromCurrency;
      var amount = this.fromAmount;
      var refID = this.transaction.id;

      o3dapi.NEO.getAccount()
      .then(account => {
        this.sendRequest(account.address, toAddress, asset, amount, refID);
      })
      .catch(e => {});
    },
    sendRequest(from, to, asset, amount, refID) {
      var args = {
        fromAddress: from,
        toAddress: to,
        asset: asset,
        amount: amount.toString(),
        remark: "refID:" + refID,
        network: "MainNet",
        fee:"0.0011"
      };

      o3dapi.NEO.send(args)
      .then(data => this.madeTransaction())
      .catch(e => console.log(e));
    },
    createTX(tx) {
      this.isCreatingTransaction = true;
      axios.post("https://platform.o3.network/public/api/xchange/transactions", tx)
      .then(response => {
        this.isCreatingTransaction = false;
        var data = response.data.result.data;
        this.transaction = data;
        console.log(this.transaction);
        setTimeout(() => this.renderQR(this.transaction.payinAddress),100)
      })
      .catch(e => {
        this.isCreatingTransaction = false;
        this.errorMessage = e.response.data.error.message;
      });
    },
    getAccount() {
      o3dapi.NEO.getAccount()
      .then(account => {
        this.connectedAddress = account.address;
      })
      .catch(e => {
        console.log(e);
        if (e.type == "CONNECTION_DENIED"){
          return;
        }
        this.showQRForMobileSection = true;
        this.showQRForMobile();
      });
    },
    getPayAccount() {
      const params = {
        asset: o3dapi.PAY.assets[this.toAsset],
      };
      o3dapi.PAY.getAccount(params)
      .then(account => {
        this.connectedAddress = account.address;
      })
      .catch(e => {
        console.log(e);
        if (e.type == "CONNECTION_DENIED"){
          return;
        }
        this.showQRForMobileSection = true;
        this.showQRForMobile();
      });
    },
    toCreateTX() {
      if (this.fromAmount < this.minAmount){
        alert("The sending amount must be greater than " + this.minAmount);
        return
      }
      var tx = {
        from: this.fromAsset,
        to: this.toAsset,
        address: this.connectedAddress,
        amount: Number(this.fromAmount)
      }
      this.createTX(tx);
    },
    uuidv4() {
      return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        )
    },
    openO3Desktop() {
      window.location.href= "o3network://";
    },
    closeQRSection() {
      this.eventSource.close();
      this.showQRForMobileSection = false;
    },
    showQRForMobile() {
      var id = this.uuidv4();
      var qrText = "o3://channel/" + id;
      document.getElementById("qrForMobile").innerHTML = "";
      var qrcode = new QRCode(document.getElementById("qrForMobile"), {
        text: qrText,
        width: 128,
        height: 128,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
      });


      if(typeof(EventSource) !== "undefined") {
        var endpoint ="https://platform.o3.network/api/v1/channel/" + id
        this.eventSource = new EventSource(endpoint, {withCredentials: false});
        this.eventSource.onmessage = event => {
          var data = JSON.parse(event.data);
          this.connectedAddress = data.address;
          this.eventSource.close();
          this.showQRForMobileSection = false;
        };

        this.eventSource.onerror = event => {
          this.showQRForMobileSection = false;
        };
      }
    },
    o3PaySend() {
      o3dapi.PAY.send({
        asset: o3dapi.PAY.assets[this.fromAsset],
        amount: this.fromAmount,
        to: this.transaction.payinAddress,
        description: "O3Swap:" + this.transaction.id,
        uniqueId: "O3Swap:" + this.transaction.id,
      })
      .then(res => this.madeTransaction())
      .catch(e => {
        console.log(e);
        if (e.type == "CONNECTION_DENIED"){
          return;
        }
        if (e.type == "NO_PROVIDER"){
          alert('Please open your O3 app to use O3 Pay.')
        }
      });
    },
    getProvider() {
      o3dapi.NEO.getProvider()
      .then(provider => {
        this.dapiProvider = provider;
      })
    },
  },
  mounted() {
    var hash = window.location.hash;
    hash = hash.replace("#","")
    if (hash != "" && hash.includes("_")){
      var pair = hash.split("_");
      var from = pair[0].toUpperCase();
      var to = pair[1].toUpperCase();

      if (externalAssets[from] || from === 'NEO' || from === 'GAS') {
        this.fromAsset = from;
      }

      if (this.toAssetPairs[from].find(({symbol}) => symbol === to)) {
        this.toAsset = to;
      }
    }

    this.getRate(this.pair, this.fromAmount);
    o3dapi.initPlugins([o3dapiNeo, o3dapiPay]);
    o3dapi.NEO.addEventListener("READY", provider => this.getProvider());
  }
});

function compareVersions(v1, v2) {
  if (!v1 || !v2) {
    return -1;
  }
  let v1parts = v1.split('.');
  let v2parts = v2.split('.');

  function isValidPart(x) {
    return /^\d+$/.test(x);
  }

  if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
    return NaN;
  }

  for (let i = 0; i < v1parts.length; ++i) {
    if (v2parts.length == i) {
      return 1;
    }

    if (v1parts[i] == v2parts[i]) {
      continue;
    }

    if (v1parts[i] > v2parts[i]) {
      return 1;
    }

    return -1;
  }

  if (v1parts.length != v2parts.length) {
    return -1;
  }

  return 0;
}
