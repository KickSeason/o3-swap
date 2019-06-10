  var app = new Vue({
    el: '#app',
    data: {
      connectedAddress:"",
      availableFromAssets:[
      {name:"Bitcoin",symbol:"BTC"},
      {name:"Ethereum",symbol:"ETH"},
      {name:"Ripple",symbol:"XRP"},
      {name:"Litecoin",symbol:"LTC"},
      {name:"Stellar",symbol:"XLM"},
      {name:"Bitcoin Cash",symbol:"BCH"},
      {name:"Bitcoin SV",symbol:"BSV"},
      {name:"EOS",symbol:"EOS"},
      {name:"Tether",symbol:"USDT"},
      {name:"Binance Coin",symbol:"BNB"},
      {name:"USD Coin",symbol:"USDC"},
      ],
      bases:{
        NEO:{name:"NEO",symbol:"NEO"},
        GAS:{name:"GAS",symbol:"GAS"},
        ONT:{name:"Ontology",symbol:"ONT"},
        ONG:{name:"Ontology GAS",symbol:"ONG"},
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
        if (this.fromAsset == "NEO" || this.fromAsset == "GAS") {
          return true;
        }
        return false;
      },
      ratePerOne(){
        return this.rate.estimatedAmount / this.fromAmount;
      },
      toAmount(){
        if (this.isLoadingRate) {
          return 0;
        }
        if (this.fromAsset == this.toAsset) {
          return 0;
        }
        if (this.rate.estimatedAmount == null) {
          return 0;
        }
        return this.rate.estimatedAmount;
      },
      pair(){
        return this.fromAsset + "_" + this.toAsset;
      },
      minAmount(){
        return Number(this.rate.minAmount);
      },
      o3PayAvailable(){
        if (
          this.dapiProvider &&
          this.dapiProvider.compatibility.includes('PAY') &&
          o3dapi.PAY.assets[this.fromAsset]
        ){
          return true;
        }
         return false;
      },
      availableToAssets(){
        var list = [this.bases.NEO, this.bases.GAS, this.bases.ONT, this.bases.ONG];

        if (this.fromAsset == "BCH" || this.fromAsset == "BSV" ) {
          list = [this.bases.NEO, this.bases.GAS, this.bases.ONG];
        } else if (this.fromAsset == "USDT" || this.fromAsset == "XRP") {
          list = [this.bases.NEO, this.bases.ONT, this.bases.ONG];
        } else if (this.fromAsset == "NEO") {
          list = [this.bases.GAS, this.bases.ONT, this.bases.ONG];
        } else if (this.fromAsset == "ONT") {
          list = [this.bases.NEO];
        } else if (this.fromAsset == "GAS") {
          list = [this.bases.NEO];
        }
        return list;
      },

    },
    watch:{
      connectedAddress(value){
        this.errorMessage = null;
      },
      fromAmount(value){
        var self = this;
        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(function(){
          if (value==="" ) {
            return
          }
          self.getRate(self.pair, value);
        }, this.doneTypingInterval);

      },
      toAsset(value){
        this.getRate(this.pair,this.fromAmount);
        this.selectToCurrency = false;
      },
      fromAsset(value) {
        this.getRate(this.pair, this.fromAmount);
        this.selectFromCurrency = false;
      }
    },
    methods:{
      connectWithO3(){
        this.getAccount();
      },
      containsSymbol(a, obj) {
        var i = a.length;
        while (i--) {
          if (a[i].symbol === obj) {
            return true;
          }
        }
        return false;
      },
      madeTransaction(){
        this.done = true;
      },
      trackingLink(transaction){
        return "https://changenow.io/exchange/txs/" + transaction.id;
      },
      emailBody(transaction){
        var subject = "Transaction on O3 Swap. Reference ID: " + transaction.id;
        var body = "Sending: " +  this.fromAmount + "" + this.fromAsset + "%0D%0A";
        body = body + "To address: " +  transaction.payinAddress + "%0D%0A";
        body = body + "Will receive: " +  transaction.amount + "" + this.toAsset  + "%0D%0A";
        body = body + "Reference ID: " +  transaction.id + "%0D%0A";
        body = body + "Status: https://changenow.io/exchange/txs/" +  transaction.id + "%0D%0A";
        return "mailto:?body=" + body + "&subject=" + subject;
      },
      selectCurrency(target){
        if (target == "from"){
          this.selectFromCurrency = !this.selectFromCurrency
        }  else if (target =='to') {
          this.selectToCurrency = !this.selectToCurrency
        }
      },
      resetTransaction(){
        this.done = false;
        this.rate = {};
        this.transaction = null;
        this.getRate(this.pair,this.fromAmount);
      },
      logo(asset){
        return "assets/coins/" + asset + ".png";
      },
      getRate(pair,amount){
        var self = this;
        if (self.fromAsset == self.toAsset) {
          self.rate = {};
          return
        }
        self.isLoadingRate = true;
        axios.get("https://platform.o3.network/public/api/xchange/rate/" + amount + "/" + pair,  {withCredentials: true, credentials: 'same-origin'})
        .then(function(response){
          self.isLoadingRate = false;
          var data = response.data.result.data;
          self.rate = data;
        })
      },
      copyAddress(field) {
        var copyText = document.getElementById(field);
        copyText.select();
        document.execCommand("copy");
        alert("Copied " + this.transaction.payinAddress + " to clipboard.")
      },
      renderQR(text){
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
        var self = this;
        var toAddress = this.transaction.payinAddress;
        var asset = this.transaction.fromCurrency;
        var amount = this.fromAmount;
        var refID = this.transaction.id;
        o3dapi.NEO.getAccount().then(function(account){
          self.sendRequest(account.address, toAddress, asset, amount, refID);
        }).catch(function(e){
        });
      },
      sendRequest(from, to, asset, amount,refID){
        var self = this;
        var args = {
          fromAddress: from,
          toAddress: to,
          asset: asset,
          amount: amount.toString(),
          remark: "refID:" + refID,
          network: "MainNet",
          fee:"0"
        };
        o3dapi.NEO.send(args).then(function(data){
          self.madeTransaction();
        }).catch(function(e){
          console.log(e);
        });
      },
      createTX(tx){
        var self = this;
        self.isCreatingTransaction = true;
        axios.post("https://platform.o3.network/public/api/xchange/transactions", tx)
        .then(function(response){
          self.isCreatingTransaction = false;
          var data = response.data.result.data;
          self.transaction = data;
          console.log(self.transaction);
          setTimeout(function(){
            self.renderQR(self.transaction.payinAddress)
          },100)
        }).catch(function(e){
          self.isCreatingTransaction = false;
          var error = e.response.data.error.message;
          self.errorMessage = error;
        })
      },
      getAccount(){
        var self = this;
        o3dapi.NEO.getAccount().then(function(account){
          self.connectedAddress = account.address;
        }).catch(function(e){
          console.log(e);
          if (e.type == "CONNECTION_DENIED"){
            return;
          }
          self.showQRForMobileSection = true;
          self.showQRForMobile();
        });
      },
      toCreateTX(){
        var self = this;
        if (self.fromAmount < self.minAmount){
          alert("The sending amount must be greater than " + self.minAmount);
          return
        }
        var tx = {
          from: self.fromAsset,
          to: self.toAsset,
          address: self.connectedAddress,
          amount: Number(self.fromAmount)
        }
        self.createTX(tx);
      },
      uuidv4() {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
          )
      },
      openO3Desktop(){
        window.location.href= "o3network://";
      },
      closeQRSection(){
        this.eventSource.close();
        this.showQRForMobileSection = false;
      },
      showQRForMobile(){
        var self = this;
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
          self.eventSource = new EventSource(endpoint, {withCredentials: false});
          self.eventSource.onmessage = function(event) {
            var data = JSON.parse(event.data);
            self.connectedAddress = data.address;
            self.eventSource.close();
            self.showQRForMobileSection = false;
          };

          self.eventSource.onerror = function(event){
              self.showQRForMobileSection = false;
          };
        }
      },
      o3PaySend() {
        var self = this;
        o3dapi.PAY.send({
          asset: o3dapi.PAY.assets[self.fromAsset],
          amount: self.fromAmount,
          to: self.transaction.payinAddress,
          description: "O3Swap:" + self.transaction.id,
          uniqueId: "O3Swap:" + self.transaction.id,
        })
        .then(res => {
          self.madeTransaction();
        })
        .catch(e => {
          console.log(e);
          if (e.type == "CONNECTION_DENIED"){
            return;
          }
          if (e.type == "NO_PROVIDER"){
            alert('Please open your O3 app to use O3 Pay.')
          }
        });
      }
    },
    mounted(){
      var self = this;
      var hash = window.location.hash;
      hash = hash.replace("#","")
      if (hash != "" && hash.includes("_")){
        var pair = hash.split("_");
        var from = pair[0].toUpperCase();
        var to = pair[1].toUpperCase();
        var fromBases = [];
        for (k in self.bases) {
          fromBases.push(self.bases[k]);
        }

        if (this.containsSymbol(fromBases,from) || this.containsSymbol(this.availableFromAssets,from)) {
          self.fromAsset = from;
        }

        if (this.containsSymbol(fromBases,to) || this.containsSymbol(this.availableToAssets, to)) {
          self.toAsset = to;
        }
      }

      this.getRate(this.pair, this.fromAmount);
      o3dapi.initPlugins([o3dapiNeo, o3dapiPay]);
      o3dapi.NEO.addEventListener("READY", provider => {
        self.dapiProvider = provider;
      });
    }
  });
