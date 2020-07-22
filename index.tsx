import React, { useEffect, useState } from "react";
import { ethers, Contract } from "ethers";

import GnosisSafe from "../../contracts/GnosisSafe.json";
import CreateAndAddModules from "../../contracts/CreateAndAddModules.json";
import ProxyFactory from "../../contracts/GnosisSafeProxyFactory.json";
import SocialRecoveryModule from "../../contracts/SocialRecoveryModule.json";
import { createAndAddModulesReducer, getParamFromTxEvent } from "../../utils";

const ZERO_ADDRESS = "0x".padEnd(42, "0");

interface MasterContracts {
  gnosisSafe?: Contract;
  proxyFactory?: Contract;
  socialRecoveryModule?: Contract;
  createAndAddModules?: Contract;
}

const Main = () => {
  // Metamask doesn't work with local, so using network and passing manually instead of web3-react.
  const [account, setAccount] = useState<string | undefined>();
  const [library, setLibrary] = useState<
    ethers.providers.JsonRpcProvider | undefined
  >();

  useEffect(() => {
    (async () => {
      let library = new ethers.providers.JsonRpcProvider();
      const account = (await library.listAccounts())[0];
      !!library && setLibrary(library);
      !!account && setAccount(account);
    })();
  }, []);

  const sendTestDeposit = async () => {
    if (!library) return;

    const signer = library.getSigner();

    const txHash = await signer.sendTransaction({
      to: (await library.listAccounts())[1],
      value: ethers.utils.parseEther("1.0"),
    });

    console.log("txHash", txHash);
  };

  // Steps:
  // Deploy Gnosis Safe master
  // Deploy ProxyFactory master
  // ProxyFactory call passes Gnosis Safe master address and setup() data

  const deployGnosisSafeContract = async () => {
    const contract = createContract(GnosisSafe);
    const instance = await contract?.deploy();
    return instance;
  };

  const deployProxyFactoryContract = async () => {
    const contract = createContract(ProxyFactory);
    const instance = await contract?.deploy();
    return instance;
  };

  const deploySocialRecoveryContract = async () => {
    const contract = createContract(SocialRecoveryModule);
    const instance = await contract?.deploy();
    return instance;
  };

  const deployCreateAndAddModulesContract = async () => {
    const contract = createContract(CreateAndAddModules);
    const instance = await contract?.deploy();
    return instance;
  };

  const [masterContracts, setMasterContracts] = useState<MasterContracts>();

  const instantiateMasterContracts = async () => {
    const gnosisSafe = await deployGnosisSafeContract();
    const proxyFactory = await deployProxyFactoryContract();
    const socialRecoveryModule = await deploySocialRecoveryContract();
    const createAndAddModules = await deployCreateAndAddModulesContract();

    const masterCopies = {
      gnosisSafe,
      proxyFactory,
      socialRecoveryModule,
      createAndAddModules,
    };

    setMasterContracts(masterCopies);
    console.log("Deployed master contracts", masterCopies);
  };

  const getSocialRecoveryData = async () => {
    if (!masterContracts) return;
    if (!library) return;

    const { socialRecoveryModule: instance } = masterContracts;
    const accounts = await library.listAccounts();

    const socialRecoveryData = instance?.interface.functions.setup.encode([
      [accounts[1], accounts[2]],
      2,
    ]);

    console.log("Social recovery data: ", socialRecoveryData);
    return socialRecoveryData;
  };

  const getProxyFactoryData = async () => {
    if (!masterContracts) return;
    if (!library) return;

    const { socialRecoveryModule: instance, proxyFactory } = masterContracts;
    const socialRecoveryData = await getSocialRecoveryData();

    const socialRecoveryProxyData = proxyFactory?.interface.functions.createProxy.encode(
      [instance?.address, socialRecoveryData]
    );

    console.log("Social proxy data: ", socialRecoveryProxyData);
    return socialRecoveryProxyData;
  };

  const getCreateAndAddModulesData = async () => {
    if (!masterContracts) return;
    if (!library) return;

    const { createAndAddModules: instance, proxyFactory } = masterContracts;
    const proxyFactoryData = await getProxyFactoryData();

    const modulesCreationData = await createAndAddModulesReducer([
      proxyFactoryData!,
    ]);

    console.log("modulesCreationData", modulesCreationData);

    const createAndAddModulesData = instance?.interface.functions.createAndAddModules.encode(
      [proxyFactory?.address, modulesCreationData]
    );

    console.log("createAndAddModulesData", createAndAddModulesData);
    return createAndAddModulesData;
  };

  const getGnosisSafeData = async () => {
    if (!masterContracts) return;
    if (!library) return;

    const { gnosisSafe: instance, createAndAddModules } = masterContracts;
    const createAndAddModulesData = await getCreateAndAddModulesData();
    const accounts = await library.listAccounts();

    const gnosisSafeData = instance?.interface.functions.setup.encode([
      [accounts[0], accounts[1], accounts[2]],
      1,
      createAndAddModules?.address,
      createAndAddModulesData,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
      0,
      ZERO_ADDRESS,
    ]);

    console.log("Gnosis safe data: ", gnosisSafeData);
    return gnosisSafeData;
  };

  const deployGnosisSafeProxy = async () => {
    if (!masterContracts) return;
    if (!library) return;

    const { gnosisSafe: instance, proxyFactory } = masterContracts;
    const gnosisSafeData = await getGnosisSafeData();

    const tx = await proxyFactory?.createProxy(
      instance?.address,
      gnosisSafeData
    );

    console.log("Receipt", await tx.wait(0));
    console.log("Successfully deployed at: ", tx.to);

    const proxyAddress = getParamFromTxEvent(
      await tx.wait(0),
      "ProxyCreation",
      "proxy",
      proxyFactory
    );

    const gnosisWallet = new Contract(
      proxyAddress,
      GnosisSafe.abi,
      library.getSigner()
    );

    const modules = await gnosisWallet.getModules();
    console.log(`${modules.length} module(s) installed at ${modules}`);
  };

  const createContract = (raw: any) => {
    if (!library) return;

    const signer = library.getSigner();
    const abi = raw.abi;
    const bytecode = raw.bytecode;
    const contract = new ethers.ContractFactory(abi, bytecode, signer);

    return contract;
  };

  return (
    <>
      <h4>Smart contract deployer</h4>
      {account && (
        <>
          <p>
            <b>Wallet address:</b> {account}
          </p>
          <p onClick={sendTestDeposit}>Send test deposit</p>
          <p onClick={instantiateMasterContracts}>Deploy master contracts</p>
          <p onClick={deployGnosisSafeProxy}>Deploy wallet</p>
        </>
      )}
    </>
  );
};

export default Main;
