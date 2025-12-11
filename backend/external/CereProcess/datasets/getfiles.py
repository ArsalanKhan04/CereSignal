import os
import random
from datetime import datetime

random.seed(datetime.now().timestamp())

def get_traineval(datapath, basedir):
    '''
        Using this to get the training and evaluation data from the source datapath seperately
        takes in the datapath for the MNE source files in the correct directory format and return train and eval path

        INPUT: 
            datapath - string - path to the MNE source files
            basedir - string - the directory before the train and eval directories

        OUPTUT: traindir, evaldir - string - path to the training and evaluation data
    '''
    traindir = os.path.join(datapath, basedir, 'train')
    evaldir = os.path.join(datapath, basedir, 'eval')

    return traindir, evaldir

def get_filedir(datapath, normal=True, basedir = '01_tcp_ar'):
    '''
        Using this to get the file directories for the MNE source files in the correct directory based on whether
        Normal or Abnormal Data
        takes in the datapath for the MNE source files in the correct directory format and returns the directory containing all files

        INPUT:
            datapath - string - path to the MNE source files (Train or Eval)
            normal - boolean - whether to get the normal or abnormal files
            basedir - string - the directory at the end of the normal or abnormal directory
            
        OUPTUT: filedir - directory containing the respective files (normal or abnormal)
    '''
    if normal:
        filedir = os.path.join(datapath, 'normal', basedir)
    else:
        filedir = os.path.join(datapath, 'abnormal', basedir)
   
    return filedir

def get_files(datapath):
    '''
        Using this to get the files from the source datapath seperately
        takes in the datapath for the MNE source files in the correct directory format and return the files

        INPUT: 
            datapath - string - path to the MNE source files
            div_first - string - the divison it has been divided into first train or class

        OUPTUT: trainfiles[2], evalfiles[2] - list of files in the training and evaluation data, both normal and abnormal
    '''
    trainfiles = {"normal": [], "abnormal": []}
    evalfiles = {"normal": [], "abnormal": []}
    for root, dirs, files in os.walk(datapath):
        roots = root.split('/')
        for file in files:
            if file.endswith('.edf'):
                if 'train' in roots:
                    if 'normal' in roots:
                        trainfiles['normal'].append(os.path.join(root, file))
                    else:
                        trainfiles['abnormal'].append(os.path.join(root, file))
                else:
                    if 'normal' in roots:
                        evalfiles['normal'].append(os.path.join(root, file))
                    else:
                        evalfiles['abnormal'].append(os.path.join(root, file))

    return trainfiles, evalfiles
    



    
