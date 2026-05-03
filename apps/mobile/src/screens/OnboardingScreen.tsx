import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Button,
  Card,
  Checkbox,
  Divider,
  List,
  SegmentedButtons,
  Text
} from "react-native-paper";

import { AddAccountDialog } from "../components/AddAccountDialog";
import { ImportCsvDialog } from "../components/ImportCsvDialog";
import { Screen } from "../components/Screen";
import { SectionTitle } from "../components/SectionTitle";
import { banks } from "../data/mockFinance";
import type { Bank, Currency } from "../data/types";
import { useFinance } from "../state/FinanceContext";

const countries = [
  { value: "HU", label: "Hungary" },
  { value: "FR", label: "France" }
];

const currencies = [
  { value: "EUR", label: "EUR" },
  { value: "HUF", label: "HUF" },
  { value: "USD", label: "USD" }
];

const setupSteps = [
  "Create secure account",
  "Choose country and base currency",
  "Select local bank",
  "Connect Wise or skip",
  "Import statement or add account"
];

export function OnboardingScreen() {
  const { accounts } = useFinance();
  const [country, setCountry] = useState("HU");
  const [currency, setCurrency] = useState("EUR");
  const [wiseConsent, setWiseConsent] = useState(true);
  const [addAccountVisible, setAddAccountVisible] = useState(false);
  const [importCsvVisible, setImportCsvVisible] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const countryName = country === "HU" ? "Hungary" : "France";
  const availableBanks = banks.filter((bank) => bank.country === countryName);
  const defaultCurrency = selectedBank?.supportedCurrencies[0] ?? (currency as Currency);

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
            Build the user's financial context before the dashboard opens.
          </Text>
          <Text variant="bodyMedium" style={styles.muted}>
            Clerk, Convex, Fastify, and Wise can plug into these boundaries as backend services arrive.
          </Text>
        </Card.Content>
      </Card>

      <SectionTitle title="Profile" />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.formContent}>
          <Text variant="labelLarge">Country</Text>
          <SegmentedButtons value={country} onValueChange={setCountry} buttons={countries} />
          <Text variant="labelLarge">Base currency</Text>
          <SegmentedButtons value={currency} onValueChange={setCurrency} buttons={currencies} />
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

      <SectionTitle title="Wise Connection" />
      <Card mode="contained" style={styles.card}>
        <Card.Content style={styles.formContent}>
          <View style={styles.consentRow}>
            <Checkbox
              status={wiseConsent ? "checked" : "unchecked"}
              onPress={() => setWiseConsent((current) => !current)}
            />
            <View style={styles.consentText}>
              <Text variant="titleSmall">Read balances, statements, rates, and quote previews</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Transfer execution remains disabled until approval and explicit confirmation flows exist.
              </Text>
            </View>
          </View>
          <Button mode="contained" icon="link-variant" disabled={!wiseConsent}>
            Connect Wise
          </Button>
        </Card.Content>
      </Card>

      <SectionTitle title="MVP Readiness" />
      <Card mode="contained" style={styles.card}>
        {setupSteps.map((step, index) => (
          <View key={step}>
            <List.Item
              title={step}
              left={(props) => (
                <List.Icon {...props} icon={index < 3 ? "check-circle" : "circle-outline"} />
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
  formContent: {
    gap: 14
  },
  bankMethods: {
    alignItems: "flex-end",
    gap: 6,
    justifyContent: "center"
  },
  consentRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8
  },
  consentText: {
    flex: 1,
    paddingTop: 8
  }
});
