import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Divider,
  List,
  Text
} from "react-native-paper";

import { AddAccountDialog } from "../components/AddAccountDialog";
import { ImportCsvDialog } from "../components/ImportCsvDialog";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { banks } from "../data/mockFinance";
import type { Bank } from "../data/types";
import { useFinance } from "../state/FinanceContext";

const setupSteps = [
  "Set country, currency, and locale in Settings",
  "Select local bank",
  "Import statement or add account"
];

export function OnboardingScreen() {
  const { accounts, settings } = useFinance();
  const country = settings.country;
  const currency = settings.baseCurrency;
  const [addAccountVisible, setAddAccountVisible] = useState(false);
  const [importCsvVisible, setImportCsvVisible] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const countryName = country === "HU" ? "Hungary" : "France";
  const availableBanks = banks.filter((bank) => bank.country === countryName);
  const defaultCurrency = selectedBank?.supportedCurrencies[0] ?? currency;

  const openManualAccount = (bank: Bank) => {
    setSelectedBank(bank);
    setSelectedAccountId(undefined);
    setAddAccountVisible(true);
  };

  const openCsvImport = (bank: Bank) => {
    const existingAccount = accounts.find((account) => account.bankId === bank.id);
    setSelectedBank(bank);
    setSelectedAccountId(existingAccount?.id);

    if (existingAccount) {
      setImportCsvVisible(true);
      return;
    }

    setAddAccountVisible(true);
  };

  return (
    <Screen>
      <Card mode="contained" style={styles.hero}>
        <Card.Content style={styles.heroContent}>
          <Text variant="labelLarge" style={styles.heroLabel}>
            First launch setup
          </Text>
          <Text variant="headlineSmall" style={styles.heroTitle}>
            Connect a bank to populate your dashboard.
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            Country, base currency, and locale live in Settings. Connect a bank below with CSV import or manual entry.
          </Text>
        </Card.Content>
      </Card>

      <SectionTitle title="Local Bank" action="Manual MVP" />
      <Card mode="contained" style={styles.card}>
        {availableBanks.map((bank, index) => (
          <View key={bank.id}>
            <List.Item
              title={bank.name}
              description={`${bank.supportedCurrencies.join(", ")} accounts`}
              left={(props) => <List.Icon {...props} icon="bank-check" />}
              right={() => (
                <View style={styles.bankMethods}>
                  <Button compact mode="outlined" icon="file-upload-outline" onPress={() => openCsvImport(bank)}>
                    CSV
                  </Button>
                  <Button compact mode="outlined" icon="pencil" onPress={() => openManualAccount(bank)}>
                    Manual
                  </Button>
                </View>
              )}
            />
            {index < availableBanks.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>

      <SectionTitle title="Setup progress" />
      <Card mode="contained" style={styles.card}>
        {setupSteps.map((step, index) => (
          <View key={step}>
            <List.Item
              title={step}
              left={(props) => (
                <List.Icon {...props} icon={index < 2 ? "check-circle" : "circle-outline"} />
              )}
            />
            {index < setupSteps.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Card>
      <AddAccountDialog
        visible={addAccountVisible}
        onDismiss={() => setAddAccountVisible(false)}
        initialBankId={selectedBank?.id}
        initialCurrency={defaultCurrency}
        initialName={selectedBank ? `${selectedBank.name} account` : "Manual account"}
        initialSource="local_bank"
      />
      <ImportCsvDialog
        visible={importCsvVisible}
        onDismiss={() => setImportCsvVisible(false)}
        initialAccountId={selectedAccountId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: "#FFF2E8",
    borderRadius: 8
  },
  heroContent: {
    gap: 8
  },
  heroLabel: {
    color: "#8A4B22"
  },
  heroTitle: {
    color: "#4D260B",
    fontWeight: "800"
  },
  muted: {
    color: "#65727D"
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8
  },
  bankMethods: {
    alignItems: "flex-end",
    gap: 6,
    justifyContent: "center"
  },
});
