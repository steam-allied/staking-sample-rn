import React, {useState, useRef, useEffect} from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Text,
  Alert,
  View,
  TextInput,
  Modal,
  Button,
  ScrollView,
  Linking,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {
  useWalletConnect,
  withWalletConnect,
} from '@walletconnect/react-native-dapp';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Web3 from 'web3';
import recorder from './ABIs/Recorder.json';
import token from './ABIs/Trax.json';
import sha1 from 'sha1';
import {ethers} from 'ethers';
import axios from 'axios';

const App = () => {
  const wallet = useWalletConnect();
  const currency = useRef('');
  const amount = useRef(NaN);
  const contracts = useRef([]);
  const [transactions, setTransactions] = useState([]);
  const [TxHash, setTxHash] = useState('');
  const [ShowPopup, setShowPopup] = useState(false);
  const [showTxns, setShowTxns] = useState(false);

  useEffect(() => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(
        'https://sepolia.infura.io/v3/129c3e4e823e47aa86199d3c14bf5456',
      ),
    );
    const TxContract = new web3.eth.Contract(
      recorder.abi,
      recorder.networks['11155111'].address,
    );
    const TokenContract = new web3.eth.Contract(
      token.abi,
      token.networks['11155111'].address,
    );
    contracts.current.push(TxContract, TokenContract);
  }, []);

  useEffect(() => {
    console.log('txns', transactions);
  }, [transactions]);

  const Txns = async () => {
    await GetTxns();
    setShowTxns(true);
  };

  const GetTxns = async () => {
    if (transactions.length === 0) {
      try {
        const response = await axios.post(
          'http://52.198.224.56:4000/tx-by-address',
          {
            address: wallet._accounts[0],
          },
        );
        setTransactions(response.data.rows);
      } catch (error) {
        throw error;
      }
    }
  };

  const SubmitHandle = e => {
    e.preventDefault();
    // ShowLoading();
    // approving allowance for recorder contract
    contracts.current[1].methods
      .GetBalance(wallet._accounts[0])
      .call((err, res) => {
        if (err) {
          console.log(err);
        } else {
          console.log('balance', res);
          if (res >= 10) {
            contracts.current[1].methods
              .GetAllowance(
                wallet._accounts[0],
                recorder.networks['11155111'].address,
              )
              .call((err, res) => {
                if (err) {
                  console.log(err);
                } else {
                  console.log('allowance', res);
                  if (res < 10) {
                    Alert.alert(
                      'Your Allowance Is Insuficient For This Transaction!',
                      'In order to go through with this transaction  you must approve allowance through you wallet',
                      [],
                      {
                        cancelable: true,
                        onDismiss: async () => {
                          const data = contracts.current[1].methods
                            .approve(
                              recorder.networks['11155111'].address,
                              ethers.utils.parseEther('100'),
                            )
                            .encodeABI();
                          try {
                            const res = await wallet.sendTransaction({
                              from: wallet._accounts[0],
                              to: token.networks['11155111'].address,
                              data,
                            });
                            console.log('approval', res);
                            transaction();
                          } catch (error) {
                            console.error(error);
                          }
                        },
                      },
                    );
                  } else {
                    // recording transaction onto blockchain
                    transaction();
                  }
                }
              });
          } else {
            Alert.alert(
              'Insufficent Trax Balance!',
              'Your wallet should have at least 10 TRX in order to go through with this transaction',
              [],
              {cancelable: true},
            );
            // HideLoading();
          }
        }
      });
  };

  const transaction = async () => {
    const hash = await sha1(
      JSON.stringify({
        currency,
        amount,
        address: wallet._accounts[0],
      }),
    );
    let date = new Date();
    date = `${date.getDate().toString()}-${date.getMonth().toString()}-${date
      .getFullYear()
      .toString()}`;
    const res = await axios.get('http://52.198.224.56:4000/latest-tx');
    const id = res.data.rows[0].id + 1;
    const data = contracts.current[0].methods
      .RecordTransaction(
        token.networks['11155111'].address,
        date,
        hash,
        id,
        wallet._accounts[0],
      )
      .encodeABI();
    try {
      const res = await wallet.sendTransaction({
        from: wallet._accounts[0],
        to: recorder.networks['11155111'].address,
        data,
      });
      console.log('tx hash', res);
      setTxHash(res);
      await axios
        .post('http://52.198.224.56:4000/tx-data', {
          address: wallet._accounts[0],
          amount: amount.current,
          ContentHash: hash,
          TxHash: res,
          date,
          currency: currency.current,
        })
        .then(async res => {
          setShowPopup(true);
          const response = await axios.post(
            'http://52.198.224.56:4000/tx-by-address',
            {
              address: wallet._accounts[0],
            },
          );
          setTransactions(response.data.rows);
          // HideLoading();
        });
    } catch (err) {
      console.error(err);
    }
    /*.on('receipt', async receipt => {
        console.log('successful tx!', receipt);
        setShowPopup(true)
        const response = await axios.post(
          'http://52.198.224.56:4000/tx-by-address',
          {
            address: wallet._accounts[0],
          },
        );
        setTransactions(response.data.rows);
        HideLoading();
      }); */
  };

  const ShowLoading = () => {
    const animation = document.querySelector('.pending');
    const submit = document.querySelector('#transact');
    animation.style.display = 'flex';
    submit.disabled = true;
  };

  const HideLoading = () => {
    const animation = document.querySelector('.pending');
    const submit = document.querySelector('#transact');
    animation.style.display = 'none';
    submit.disabled = false;
  };
  return wallet.connected ? (
    <View style={styles.App}>
      <Button
        title="Kill Connection"
        onPress={() => {
          wallet.killSession();
        }}></Button>
      <View style={styles.FormWrapper}>
        <Text style={styles.h1}>TRAX</Text>
        <View style={styles.field}>
          <Text>Currency</Text>
          <Picker
            selectedValue={'Select crypto token'}
            style={styles.input}
            onValueChange={val => {
              currency.current = val;
            }}>
            <Picker.Item label="BTC" value="bitcoin" />
            <Picker.Item label="DOGE" value="dogecoin" />
            <Picker.Item label="SHIB" value="shiba inu" />
            <Picker.Item label="MATIC" value="polygon" />
            <Picker.Item label="USDT" value="tether" />
          </Picker>
          <View style={styles.input} />
        </View>
        <View style={styles.field}>
          <Text htmlFor="amount">Amount</Text>
          <TextInput
            keyboardType="numeric"
            placeholder="type in the amount you wish to trade"
            onChangeText={val => {
              amount.current = val;
            }}
            style={styles.input}
          />
        </View>
        <TouchableOpacity onPress={SubmitHandle} style={styles.btn2}>
          <Text style={styles.BtnTxt}>Transact</Text>
        </TouchableOpacity>
        {/* <View className="pending">
          <View className="spinner"></View>
          <Text className="loading-msg">Transaction pending</Text>
        </View> */}
      </View>
      <TouchableOpacity onPress={Txns}>
        <Text style={styles.BtnTxt2}>View Your Transactions</Text>
      </TouchableOpacity>
      <Modal animationType="slide" visible={ShowPopup}>
        <View style={styles.modal}>
          <TouchableOpacity
            style={styles.close}
            onPress={() => {
              setShowPopup(false);
            }}>
            <Text style={{fontSize: 29, fontWeight: 'bold'}}>X</Text>
          </TouchableOpacity>
          <Text style={styles.h2}>Transaction Successful!</Text>
          <View style={styles.tx}>
            <View>
              <Text style={styles.h3}>Hash</Text>
              <Text
                style={styles.TxInfoLink}
                onPress={() =>
                  Linking.openURL(`https://sepolia.etherscan.io/tx/${TxHash}`)
                }>
                {TxHash}
              </Text>
            </View>
            <View>
              <Text style={styles.h3}>Data</Text>
              <Text style={styles.TxInfo}>
                {` ${JSON.stringify({
                  currency: currency.current,
                  amount: amount.current,
                  address: wallet._accounts[0],
                })}`}
              </Text>
            </View>
          </View>
          {/* <TouchableOpacity
            className="scroll"
            onClick={() => {
              window.scrollBy({
                top: document.body.scrollHeight,
                behavior: 'smooth',
              });
              ModalCloser();
            }}>
            <Text>More Info</Text>
          </TouchableOpacity> */}
        </View>
      </Modal>
      <Modal animationType="slide" visible={showTxns}>
        <View style={styles.transactions}>
          <TouchableOpacity
            style={styles.close}
            onPress={() => {
              setShowTxns(false);
            }}>
            <Text style={{fontSize: 29, fontWeight: 'bold'}}>X</Text>
          </TouchableOpacity>
          <View style={{marginBottom: '10%'}}>
            <Text style={styles.h2}>Transactions By</Text>
            <Text style={styles.h4}>{wallet._accounts[0]}</Text>
          </View>
          <ScrollView>
            {transactions.map(tx => (
              <View style={styles.transaction} key={tx.id}>
                <Text>
                  Transaction Hash:{' '}
                  <Text
                    style={{color: 'blue'}}
                    onPress={() =>
                      Linking.openURL(
                        `https://sepolia.etherscan.io/tx/${tx.tx_hash}`,
                      )
                    }>
                    {tx.tx_hash}
                  </Text>
                </Text>
                <View style={{marginLeft: '5%'}}>
                  <Text>ID: {tx.id}</Text>
                  <Text>token: {tx.token}</Text>
                  <Text>amount: {tx.amount}</Text>
                  <Text>content hash: {tx.content_hash}</Text>
                  <Text>date: {tx.date}</Text>
                  <Text>
                    data:
                    {` ${JSON.stringify({
                      currency: tx.token,
                      amount: Number(tx.amount),
                      address: wallet._accounts[0],
                    })}`}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  ) : (
    <TouchableOpacity
      onPress={() => {
        wallet.connect();
      }}
      style={styles.btn1}>
      <Text style={styles.BtnTxt}>Connect</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  App: {
    flex: 1,
  },
  btn1: {
    backgroundColor: 'rgb(2, 145, 222)',
    marginTop: 350,
    padding: 15,
    width: 200,
    borderRadius: 5,
    marginLeft: 100,
  },
  btn2: {
    backgroundColor: 'rgb(2, 145, 222)',
    width: '80%',
    marginLeft: '10%',
    borderRadius: 5,
    padding: 15,
  },
  BtnTxt: {
    color: 'white',
    textAlign: 'center',
  },
  BtnTxt2: {
    fontSize: 20,
    color: 'rgb(2, 145, 222)',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  h1: {
    color: 'rgb(2, 145, 222)',
    fontSize: 50,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  h2: {
    fontSize: 40,
    fontWeight: 'bold',
    marginTop: '22%',
    textAlign: 'center',
    color: 'rgb(2, 145, 222)',
  },
  h3: {
    fontSize: 25,
    color: 'black',
  },
  h4: {
    color: 'rgb(2, 145, 222)',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  FormWrapper: {
    textAlign: 'center',
    height: '80%',
    justifyContent: 'space-around',
  },
  field: {
    width: '80%',
    marginLeft: '10%',
  },
  input: {
    borderBottomWidth: 3,
    borderBottomColor: 'rgb(13, 124, 236)',
  },
  transactions: {
    flex: 1,
  },
  modal: {
    flex: 1,
  },
  close: {
    height: '12%',
    width: '5%',
    position: 'absolute',
    left: '88%',
    top: '2%',
  },
  tx: {
    height: '40%',
    width: '90%',
    marginLeft: '5%',
    justifyContent: 'space-around',
    marginTop: '30%',
  },
  TxInfo: {
    fontSize: 20,
  },
  TxInfoLink: {
    color: 'blue',
    fontSize: 20,
  },
  transaction: {
    width: '90%',
    marginLeft: '5%',
    marginBottom: '3%',
  },
});

export default withWalletConnect(App, {
  redirectUrl:
    Platform.OS === 'web'
      ? window.location.origin
      : 'wc:00e46b69-d0cc-4b3e-b6a2-cee442f97188@1?bridge=https%3A%2F%2Fbridge.walletconnect.org&key=91303dedf64285cbbaf9120f6e9d160a5c8aa3deb67017a3874cd272323f48ae',
  storageOptions: {
    asyncStorage: AsyncStorage,
  },
});
