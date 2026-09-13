import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Image, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Patient, Report } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function Home() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme, patients } = useAppContext();
  const isDark = theme === 'dark';
  
  const [search, setSearch] = useState('');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const filteredPatients = patients.filter(p => 
    p.nome_civil.toLowerCase().includes(search.toLowerCase()) || 
    p.prontuario.includes(search)
  );

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#d9e2e8',
    cardBg: isDark ? '#2c3539' : '#d9e2e8',
    cardBorder: isDark ? '#4a5568' : '#a0aec0',
    greenBtn: '#12a454',
    blueBtn: '#1d70b8',
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 100);
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const toggleExpand = (id: string) => {
    setExpandedPatientId(expandedPatientId === id ? null : id);
  };

  const renderReport = (report: Report, index: number, total: number) => {
    const isFinished = report.status === 'Finalizado';
    const gradientColors = isFinished 
      ? ['#a8e063', '#56ab2f'] as const
      : ['#f6d365', '#fda085'] as const;

    return (
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.reportCard}
        key={report.id}
      >
        <View>
          <Text style={styles.reportTitle}>Relatório {total - index}</Text>
          <Text style={styles.reportDate}>Data de última edição: {report.atualizado_em || report.criado_em}</Text>
        </View>
        <Feather name="play" size={16} color="#000" />
      </LinearGradient>
    );
  };

  const renderPatient = ({ item }: { item: Patient }) => {
    const isExpanded = expandedPatientId === item.id;
    const lastReport = item.reports.length > 0 ? item.reports[item.reports.length - 1] : null;

    return (
      <View style={[styles.patientWrapper, { backgroundColor: isExpanded ? colors.cardBorder : 'transparent', padding: isExpanded ? 10 : 0, borderRadius: 10, marginBottom: 10 }]}>
        <TouchableOpacity 
          style={[styles.patientCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]} 
          onPress={() => toggleExpand(item.id)}
        >
          <View style={styles.patientInfo}>
            {item.foto_perfil_path ? (
              <Image source={{ uri: item.foto_perfil_path }} style={styles.patientPhoto} />
            ) : (
              <View style={styles.patientPhotoPlaceholder}>
                <Feather name="user" size={30} color={isDark ? '#ccc' : '#666'} />
              </View>
            )}
            <View style={styles.patientTextInfo}>
              <Text style={[styles.patientName, { color: colors.text }]}>{item.nome_civil}</Text>
              <Text style={[styles.patientId, { color: colors.text }]}>Nº PRONTUÁRIO: {item.prontuario}</Text>
              <Text style={[styles.patientLastReport, { color: colors.text }]}>
                ÚLTIMO RELATÓRIO: {lastReport ? (lastReport.atualizado_em || lastReport.criado_em) : 'Nenhum'}
              </Text>
            </View>
          </View>
          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color={colors.text} />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedArea}>
            <TouchableOpacity 
              style={[styles.blueBtn, { backgroundColor: colors.blueBtn }]}
              onPress={() => navigation.navigate('ReportForm', { patientId: item.id })}
            >
              <Text style={styles.btnText}>Novo relatório</Text>
              <Feather name="file-text" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            {[...item.reports].reverse().map((r, i) => renderReport(r, i, item.reports.length))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header />
      
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
          <Feather name="search" size={20} color={isDark ? '#aaa' : '#555'} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Pesquisar paciente"
            placeholderTextColor={isDark ? '#aaa' : '#555'}
            value={search}
            onChangeText={setSearch}
          />
          <Feather name="filter" size={20} color={isDark ? '#aaa' : '#555'} />
        </View>

        <TouchableOpacity 
          style={[styles.greenBtn, { backgroundColor: colors.greenBtn }]}
          onPress={() => navigation.navigate('PatientForm')}
        >
          <Text style={styles.btnText}>Novo paciente</Text>
          <Feather name="plus-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>

      {patients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum paciente cadastrado</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredPatients}
          keyExtractor={item => item.id}
          renderItem={renderPatient}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}

      {showScrollTop && (
        <TouchableOpacity style={styles.scrollTopBtn} onPress={scrollToTop}>
          <Text style={styles.scrollTopText}>Voltar para o topo</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 25,
    marginBottom: 15,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
  greenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 25,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: '500' },
  listContent: { paddingHorizontal: 20, paddingBottom: 80 },
  patientWrapper: { width: '100%' },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
  },
  patientInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  patientPhoto: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  patientPhotoPlaceholder: {
    width: 50, height: 50, borderRadius: 25, marginRight: 15,
    backgroundColor: '#999', justifyContent: 'center', alignItems: 'center'
  },
  patientTextInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: 'bold' },
  patientId: { fontSize: 12, opacity: 0.8, marginTop: 2 },
  patientLastReport: { fontSize: 10, opacity: 0.6, marginTop: 2 },
  expandedArea: { marginTop: 10 },
  blueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 15,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  reportCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  reportTitle: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  reportDate: { fontSize: 12, color: '#000', marginTop: 4 },
  scrollTopBtn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  scrollTopText: { color: '#fff', fontWeight: 'bold' }
});
