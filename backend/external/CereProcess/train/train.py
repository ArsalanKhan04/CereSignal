import torch
import torch.nn.functional as F
from tqdm.notebook import tqdm
from IPython.display import clear_output
from torchmetrics import ROC, AUROC
import matplotlib.pyplot as plt

def evaluate(model, val_loader, criterion, device, metrics, history, plot_roc=False):
    model.to(device)
    val_loss = 0.0
    model.eval()
    metrics.reset()

    # ROC metric for binary
    roc_curve = ROC(task='binary').to(device)
    auroc = AUROC(task='binary').to(device)

    actual = torch.tensor([], device=device, dtype=torch.long)
    pred   = torch.tensor([], device=device, dtype=torch.long)

    with torch.no_grad():
        for data, target in val_loader:
            data, target = data.to(device).float(), target.to(device).float()
            output = model(data).float()

            # loss & metrics
            loss = criterion(output, target)
            val_loss += loss.item()

            _, predicted = output.max(1)
            label_check = target.argmax(1).long()
            metrics.update(label_check, predicted)

            actual = torch.cat([actual, label_check])
            pred   = torch.cat([pred, predicted])

            # ROC: use positive-class prob
            auroc.update(predicted, label_check)
            probs = F.softmax(output, dim=1)
            roc_curve.update(probs[:, 1], label_check)

        # finalize loss & metrics
        val_loss /= len(val_loader)
        results = metrics.compute()
        results.update({"loss": val_loss})
        history.update(results, 'val')

    history.update_cm(actual.tolist(), pred.tolist())

    if plot_roc:
        # compute ROC curve data
        fpr, tpr, thresholds = roc_curve.compute()
        # print(f"fpr: {fpr}")
        # print(f"tpr: {tpr}")
        # print(f"thresholds: {thresholds}")

        # plot
        plt.figure()
        plt.plot(fpr.cpu(), tpr.cpu(), label=f'ROC (AUC = {auroc.compute():.2f})')
        plt.plot([0,1], [0,1], 'k--', label='Chance (AUC = 0.50)')
        plt.xlim(0,1); plt.ylim(0,1.05)
        plt.xlabel('False Positive Rate')
        plt.ylabel('True Positive Rate')
        plt.title('ROC Curve')
        plt.legend(loc='lower right')
        plt.show()

    return val_loss

def train(model, train_loader, val_loader, optimizer, criterion, epochs, history, metrics, device, save_path, earlystopping, accum_iter = 1, scheduler=None, save_best_acc=False):
    model = model.to(device)
    model.train()
    for epoch in range(epochs):
        train_loss = 0
        metrics.reset()
        batch_idx = 0
        for data, target in tqdm(train_loader):
            data, target = data.to(device), target.to(device)
            data = data.float()
            target = target.float()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()
            if ((batch_idx + 1) % accum_iter == 0) or (batch_idx + 1 == len(train_loader)):
                optimizer.step()
                optimizer.zero_grad()
            output = F.softmax(output, dim = -1)
            _, predicted = torch.max(output, 1)
            label_check = torch.argmax(target, 1)
            train_loss += loss.item()
            batch_idx += 1
            # clearing data for space
            del data, target, output, loss
            if device == 'cuda':
                torch.cuda.empty_cache()
            metrics.update(label_check, predicted)
        train_loss /= len(train_loader)
        results = metrics.compute()
        results.update({"loss": train_loss})
        history.update(results, 'train')
        val_loss = evaluate(model, val_loader, criterion, device, metrics, history)
        model.train()
        clear_output(wait=True)
        if save_best_acc:
            earlystopping(history.history["val"]["accuracy"][-1], model, save_best_acc=True)
            if scheduler:
                scheduler.step(val_loss)
            if earlystopping.early_stop:
                print("Early stopping")
                break 
        else:
            earlystopping(val_loss, model)
            if scheduler:
                scheduler.step(val_loss)
            if earlystopping.early_stop:
                print("Early stopping")
                break
        if device == 'cuda':
            torch.cuda.empty_cache()
        print(f'Epoch {epoch+1}/{epochs} - Train Loss: {train_loss:.4f} - Val Loss: {val_loss:.4f}', flush=True)
        print(f'Train Accuracy: {float(history.history["train"]["accuracy"][-1]):.4f} - Val Accuracy: {float(history.history["val"]["accuracy"][-1]):.4f}', flush=True)
        print(f'Train F1 Score: {float(history.history["train"]["f1score"][-1]):.4f} - Val F1 Score: {float(history.history["val"]["f1score"][-1]):.4f}', flush = True)
        history.print_best()
        history.plot()
    model.load_state_dict(torch.load(earlystopping.path))
    val_loss = evaluate(model, val_loader, criterion, device, metrics, history)
    clear_output(wait=True)
    history.plot()
    history.print_best()
    history.display_cm()
    return model
