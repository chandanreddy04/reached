import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Contact, useSafety } from '@/state/safety-store';
import { isValidPhone, normalizePhone } from '@/utils/phone';

/** Circle of Trust: the people who get alerted if you miss a check-in. */
export default function CircleScreen() {
  const { contacts, addContact, updateContact, removeContact, profileName, setProfileName } =
    useSafety();
  const theme = useTheme();

  // ----- Your name -----
  // null = not editing (show the saved name); a string = what's being typed.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const shownName = nameDraft ?? profileName;
  const nameChanged = nameDraft !== null && nameDraft.trim() !== '' && nameDraft.trim() !== profileName;
  const [savingName, setSavingName] = useState(false);

  async function handleSaveName() {
    setSavingName(true);
    const saved = await setProfileName(shownName);
    setSavingName(false);
    if (!saved) {
      Alert.alert("Couldn't save", 'The server could not be reached. Check your internet and try again.');
      return;
    }
    setNameDraft(null);
  }

  // ----- Add a person -----
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const normalizedPhone = normalizePhone(phone);
  const phoneOk = isValidPhone(normalizedPhone);
  const canAdd = name.trim() !== '' && phoneOk;
  const [saving, setSaving] = useState(false);

  // The contact being edited, or null when the form adds a new person.
  const [editing, setEditing] = useState<Contact | null>(null);

  function startEditing(contact: Contact) {
    setEditing(contact);
    setName(contact.name);
    setPhone(contact.phone);
  }

  function stopEditing() {
    setEditing(null);
    setName('');
    setPhone('');
  }

  async function handleSave() {
    setSaving(true);
    const saved = editing
      ? await updateContact(editing.id, name, normalizedPhone)
      : await addContact(name, normalizedPhone);
    setSaving(false);
    if (!saved) {
      Alert.alert("Couldn't save", 'The server could not be reached. Check your internet and try again.');
      return; // keep what was typed so you can try again
    }
    stopEditing(); // clear the boxes for the next person
  }

  async function remove(contact: Contact) {
    if (editing?.id === contact.id) stopEditing();
    if (!(await removeContact(contact.id))) {
      Alert.alert("Couldn't remove", 'The server could not be reached. Check your internet and try again.');
    }
  }

  function confirmRemove(contact: Contact) {
    Alert.alert(`Remove ${contact.name}?`, 'They will no longer be alerted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(contact) },
    ]);
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <Screen title="Your Circle">
      {/* Your name, shown in the texts your Circle receives */}
      <View style={styles.form}>
        <ThemedText type="smallBold">Your name</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Used in the texts, e.g. &quot;{shownName.trim() || 'Alex'} hasn&apos;t checked in.&quot;
        </ThemedText>
        <TextInput
          value={shownName}
          onChangeText={setNameDraft}
          placeholder="Your first name"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="words"
          maxLength={60}
          style={inputStyle}
        />
        {nameChanged && (
          <BigButton
            label={savingName ? 'Saving…' : 'Save name'}
            onPress={handleSaveName}
            disabled={savingName}
          />
        )}
        {!profileName && !nameChanged && (
          <ThemedText type="small" style={{ color: Brand.red }}>
            Add your name so your Circle knows who the alert is about.
          </ThemedText>
        )}
      </View>

      <ThemedText themeColor="textSecondary">
        These people get a text if you miss a check-in or press SOS. They don&apos;t need the
        app.
      </ThemedText>

      {/* Add a person (or edit one, after tapping Edit in the list) */}
      <View style={styles.form}>
        {editing && <ThemedText type="smallBold">Editing {editing.name}</ThemedText>}
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="words"
          style={inputStyle}
        />
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone with country code, e.g. +1 555 123 4567"
          placeholderTextColor={theme.textSecondary}
          keyboardType="phone-pad"
          style={inputStyle}
        />
        {phone.trim() !== '' && !phoneOk && (
          <ThemedText type="small" style={{ color: Brand.red }}>
            Start with + and the country code (e.g. +1 for US/Canada, +44 UK, +91 India).
          </ThemedText>
        )}
        <BigButton
          label={saving ? 'Saving…' : editing ? 'Save changes' : 'Add to Circle'}
          onPress={handleSave}
          disabled={!canAdd || saving}
        />
        {editing && <BigButton label="Cancel" variant="plain" onPress={stopEditing} />}
      </View>

      {/* The list of people */}
      {contacts.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No one in your Circle yet.
        </ThemedText>
      ) : (
        <View style={styles.list}>
          {contacts.map((contact) => (
            <ThemedView key={contact.id} type="backgroundElement" style={styles.row}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold">{contact.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {contact.phone}
                </ThemedText>
                {/* Contacts added before Stage 5 may lack a country code. */}
                {!isValidPhone(contact.phone) && (
                  <ThemedText type="small" style={{ color: Brand.red }}>
                    Can&apos;t be texted: tap Edit to add the +country code
                  </ThemedText>
                )}
              </View>
              <Pressable
                onPress={() => startEditing(contact)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${contact.name}`}
                hitSlop={Spacing.two}
                style={styles.rowAction}>
                <ThemedText type="smallBold" style={{ color: Brand.green }}>
                  Edit
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={() => confirmRemove(contact)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${contact.name}`}
                hitSlop={Spacing.two}>
                <ThemedText type="smallBold" style={{ color: Brand.red }}>
                  Remove
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.two,
  },
  input: {
    fontSize: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
  },
  rowAction: {
    marginRight: Spacing.three,
  },
});
